# -*- coding: utf-8 -*-
import json
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from flask import Blueprint, jsonify, request
from sqlalchemy import func
from models import SpotifyTrack
from utils import login_required, network
from models import SearchHistory
from flask import session
from datetime import datetime
from exts import db

taste_bp = Blueprint('taste', __name__)


# 1. 获取并分析指定用户的音乐偏好、听歌时段特征及深度聚类画像
@taste_bp.route('/user_taste', methods=['GET'])
@login_required
def get_user_taste():
    username = request.args.get('username')
    if not username: return jsonify({'code': 400, 'msg': '请输入用户名'})

    user_id = session.get('user_id')
    existing = SearchHistory.query.filter_by(user_id=user_id, keyword=username, search_type='user').first()
    if existing:
        existing.created_at = datetime.utcnow()
    else:
        db.session.add(SearchHistory(user_id=user_id, keyword=username, search_type='user'))
    db.session.commit()

    try:
        lf_user = network.get_user(username)
        avatar_url = ""
        try:
            avatar_url = lf_user.get_image()
        except:
            pass

        top_artists_data = lf_user.get_top_artists(limit=50)
        if not top_artists_data: return jsonify({'code': 404, 'msg': '没有听歌记录'})

        raw_recent_tracks = lf_user.get_recent_tracks(limit=50)
        recent_tracks_info = []

        time_buckets = {
            '🌅 晨间 (06:00-12:00)': {'count': 0, 'artists': []},
            '☀️ 午后 (12:00-18:00)': {'count': 0, 'artists': []},
            '🌆 夜晚 (18:00-24:00)': {'count': 0, 'artists': []},
            '🌙 凌晨 (00:00-06:00)': {'count': 0, 'artists': []}
        }

        for i, t in enumerate(raw_recent_tracks):
            is_playing_now = getattr(t, 'playback_date', "") == "" or "正在播放" in getattr(t, 'playback_date', "")
            played_at_str = "正在播放" if is_playing_now else getattr(t, 'playback_date', "未知时间")
            artist_name_lower = t.track.get_artist().get_name().lower().strip()

            if i < 17:
                recent_tracks_info.append({
                    'name': t.track.get_title(),
                    'artist': t.track.get_artist().get_name(),
                    'played_at': played_at_str
                })

            try:
                hour = 12
                if is_playing_now:
                    hour = datetime.now().hour
                elif hasattr(t, 'timestamp') and t.timestamp:
                    hour = datetime.fromtimestamp(int(t.timestamp)).hour

                bucket_key = '🌙 凌晨 (00:00-06:00)'
                if 6 <= hour < 12:
                    bucket_key = '🌅 晨间 (06:00-12:00)'
                elif 12 <= hour < 18:
                    bucket_key = '☀️ 午后 (12:00-18:00)'
                elif 18 <= hour < 24:
                    bucket_key = '🌆 夜晚 (18:00-24:00)'

                time_buckets[bucket_key]['count'] += 1
                time_buckets[bucket_key]['artists'].append(artist_name_lower)
            except Exception:
                continue

        time_period_data = [{'name': k, 'value': v['count']} for k, v in time_buckets.items() if v['count'] > 0]
        if not time_period_data:
            time_period_data = [{'name': '暂无时间数据', 'value': 1}]

        lf_artists_lower = [item.item.get_name().lower().strip() for item in top_artists_data]
        top_artists_info = [{'name': item.item.get_name(), 'playcount': int(item.weight)} for item in top_artists_data]

        all_query_artists = list(set(lf_artists_lower + [a for b in time_buckets.values() for a in b['artists']]))
        matched_tracks = SpotifyTrack.query.filter(func.lower(SpotifyTrack.artists).in_(all_query_artists)).all()
        if not matched_tracks: return jsonify({'code': 404, 'msg': '暂未收录该用户的偏好'})

        genre_stats = {}
        features_sum = {'danceability': 0, 'energy': 0, 'valence': 0, 'acousticness': 0, 'liveness': 0}
        global_tracks = [t for t in matched_tracks if t.artists.strip("[]'\"").lower() in lf_artists_lower]
        valid_tracks_count = len(global_tracks) if global_tracks else 1

        for track in global_tracks:
            acc, dan, ene, val, liv = track.acousticness or 0, track.danceability or 0, track.energy or 0, track.valence or 0, track.liveness or 0
            genre = "Acoustic / Folk" if acc > 0.65 else "Electronic / Dance" if dan > 0.75 else "Rock / Metal" if ene > 0.75 else "Pop" if val > 0.6 else "Indie / Alternative"
            genre_stats[genre] = genre_stats.get(genre, 0) + 1
            features_sum['danceability'] += dan;
            features_sum['energy'] += ene;
            features_sum['valence'] += val
            features_sum['acousticness'] += acc;
            features_sum['liveness'] += liv

        global_radar_data = [round((features_sum[k] / valid_tracks_count) * 100, 1) for k in
                             ['energy', 'danceability', 'valence', 'acousticness', 'liveness']]
        global_genre_data = [{'name': k, 'value': v} for k, v in
                             sorted(genre_stats.items(), key=lambda x: x[1], reverse=True)[:5]] or [
                                {'name': 'Indie / Alternative', 'value': 1}]

        time_taste_map = {}
        for bucket_name, data in time_buckets.items():
            if data['count'] == 0: continue

            b_tracks = [t for t in matched_tracks if t.artists.strip("[]'\"").lower() in data['artists']]
            if not b_tracks: continue

            b_genre_stats = {}
            b_feats = {'danceability': 0, 'energy': 0, 'valence': 0, 'acousticness': 0, 'liveness': 0}
            b_len = len(b_tracks)

            for t in b_tracks:
                acc, dan, ene, val, liv = t.acousticness or 0, t.danceability or 0, t.energy or 0, t.valence or 0, t.liveness or 0
                genre = "Acoustic / Folk" if acc > 0.65 else "Electronic / Dance" if dan > 0.75 else "Rock / Metal" if ene > 0.75 else "Pop" if val > 0.6 else "Indie / Alternative"
                b_genre_stats[genre] = b_genre_stats.get(genre, 0) + 1
                b_feats['danceability'] += dan;
                b_feats['energy'] += ene;
                b_feats['valence'] += val
                b_feats['acousticness'] += acc;
                b_feats['liveness'] += liv

            time_taste_map[bucket_name] = {
                'radar': [round((b_feats[k] / b_len) * 100, 1) for k in
                          ['energy', 'danceability', 'valence', 'acousticness', 'liveness']],
                'genres': [{'name': k, 'value': v} for k, v in
                           sorted(b_genre_stats.items(), key=lambda x: x[1], reverse=True)[:5]]
            }

        clusters_info, scatter_data = [], []
        if valid_tracks_count >= 10:
            track_data = [{'name': t.track_name, 'artist': t.artists.strip("[]'\""), 'energy': float(t.energy),
                           'danceability': float(t.danceability), 'valence': float(t.valence),
                           'acousticness': float(t.acousticness), 'liveness': float(t.liveness)} for t in global_tracks
                          if t.energy is not None and t.valence is not None and t.danceability is not None]
            df = pd.DataFrame(track_data)

            if len(df) >= 3:
                X_scaled = StandardScaler().fit_transform(
                    df[['energy', 'danceability', 'valence', 'acousticness', 'liveness']].values)
                n_clusters = min(3, len(df))
                kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
                df['cluster'] = kmeans.fit_predict(X_scaled)
                cluster_centers = StandardScaler().fit(
                    df[['energy', 'danceability', 'valence', 'acousticness', 'liveness']].values).inverse_transform(
                    kmeans.cluster_centers_)

                for i in range(n_clusters):
                    center = cluster_centers[i]
                    cluster_name = "🎉 动感派对" if center[0] > 0.65 and center[1] > 0.6 else "🎸 原声纯粹" if center[
                                                                                                                 3] > 0.6 else "🌙 深夜沉思" if \
                    center[2] < 0.4 and center[0] < 0.5 else "🎧 流行日常"

                    songs_in_cluster, seen_artists = [], set()
                    for _, row in df[df['cluster'] == i].iterrows():
                        if row['artist'] not in seen_artists:
                            songs_in_cluster.append({'name': row['name'], 'artist': row['artist']})
                            seen_artists.add(row['artist'])
                        if len(songs_in_cluster) == 3: break

                    clusters_info.append({'cluster_id': int(i), 'name': cluster_name,
                                          'center_features': [round(val * 100, 1) for val in center.tolist()],
                                          'representative_songs': songs_in_cluster})

                scatter_data = [
                    {'name': row['name'], 'value': [round(row['energy'] * 100, 1), round(row['valence'] * 100, 1)],
                     'cluster': int(row['cluster'])} for _, row in df.iterrows()]

        return jsonify({'code': 200, 'data': {
            'username': username, 'avatar_url': avatar_url, 'recent_tracks': recent_tracks_info,
            'matched_tracks_count': valid_tracks_count, 'top_artists': top_artists_info[:6],
            'radar_data': global_radar_data, 'genre_data': global_genre_data, 'clusters_info': clusters_info,
            'scatter_data': scatter_data,
            'time_period_data': time_period_data,
            'time_taste_map': time_taste_map
        }})
    except Exception as e:
        print(f"Error fetching user taste: {e}")
        return jsonify({'code': 500, 'msg': '处理失败'})