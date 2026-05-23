# -*- coding: utf-8 -*-
import json
import logging
import random
from sqlalchemy import func
from datetime import datetime
from flask import Blueprint, jsonify, request, session
from scipy.spatial import distance
from exts import db
from utils import login_required, sp, network

from models import User, SpotifyTrack, Artist, Album, SearchHistory, Leaderboard, LeaderboardArtist, LeaderboardTrack
from models import FavoriteArtist, FavoriteAlbum, FavoriteTrack

search_bp = Blueprint('search', __name__)

logging.getLogger('spotipy').setLevel(logging.CRITICAL)
logging.getLogger('spotipy.client').setLevel(logging.CRITICAL)


# 1. 获取指定艺人的排名趋势
@search_bp.route('/artist_trend', methods=['GET'])
@login_required
def get_artist_trend():
    artist_name = request.args.get('name')
    if not artist_name:
        return jsonify({'code': 400, 'msg': '缺少艺人名称'})

    try:
        records = LeaderboardArtist.query.filter_by(name=artist_name).all()

        if not records:
            return jsonify({'code': 200, 'data': []})

        date_rank_map = {}
        for r in records:
            parts = r.board_key.split('_')
            if len(parts) >= 2:
                date_str = parts[-1]
                if date_str not in date_rank_map or r.rank < date_rank_map[date_str]:
                    date_rank_map[date_str] = r.rank

        sorted_dates = sorted(date_rank_map.keys())[-7:]
        trend_data = [{'date': d[5:], 'rank': date_rank_map[d]} for d in sorted_dates]

        return jsonify({'code': 200, 'data': trend_data})
    except Exception as e:
        print(f"获取艺人排名趋势失败: {e}")
        return jsonify({'code': 500, 'msg': str(e)})


# 2. 搜索并返回相关单曲列表
@search_bp.route('/search_track', methods=['GET'])
@login_required
def api_search_track():
    query = request.args.get('q')
    if not query: return jsonify({'code': 400, 'msg': '关键字不能为空'})

    try:
        items = sp.search(q=query, type='track', limit=10)['tracks']['items']
        return jsonify({'code': 200, 'data': [{
            'id': t['id'], 'name': t['name'], 'artist': t['artists'][0]['name'] if t['artists'] else 'Unknown',
            'cover_url': t['album']['images'][0]['url'] if t['album']['images'] else ''
        } for t in items]})
    except Exception:
        return jsonify({'code': 500, 'msg': '搜索失败'})


# 3. 获取指定单曲的详细信息及相似推荐
@search_bp.route('/track_detail', methods=['GET'])
@login_required
def get_track_detail():
    track_id = request.args.get('id')
    if not track_id: return jsonify({'code': 400, 'msg': '缺少 track_id 参数'})

    try:
        db_track = SpotifyTrack.query.filter_by(track_id=track_id).first()
        cover_url, preview_url, release_date, api_album_name, api_data = "", None, "未知", "未知专辑", {}

        try:
            sp_track = sp.track(track_id)
            album_info = sp_track.get('album', {})
            api_album_name = album_info.get('name', '未知专辑')
            release_date = album_info.get('release_date', '未知时间')
            cover_url = album_info['images'][0]['url'] if album_info.get('images') else ""
            preview_url = sp_track.get('preview_url')
            api_data = {'name': sp_track.get('name', 'Unknown'),
                        'artists': ", ".join([a['name'] for a in sp_track.get('artists', [])]),
                        'popularity': sp_track.get('popularity', 0)}
        except Exception:
            pass

        if db_track:
            track_info = {'id': track_id, 'name': db_track.track_name,
                          'artist': db_track.artists.strip("[]'\"") if db_track.artists else "未知",
                          'album': api_album_name if api_album_name != "未知专辑" else db_track.album_name,
                          'popularity': db_track.popularity or 0}
            features = {'danceability': float(db_track.danceability or random.uniform(0.45, 0.85)),
                        'energy': float(db_track.energy or random.uniform(0.5, 0.9)),
                        'valence': float(db_track.valence or random.uniform(0.3, 0.8)),
                        'acousticness': float(db_track.acousticness or random.uniform(0.05, 0.4)),
                        'liveness': float(db_track.liveness or random.uniform(0.08, 0.35))}
        else:
            if not api_data: return jsonify({'code': 404, 'msg': '单曲不存在'})
            track_info = {'id': track_id, 'name': api_data['name'], 'artist': api_data['artists'],
                          'album': api_album_name, 'popularity': api_data['popularity']}
            features = {}
            try:
                sp_f = sp.audio_features(track_id)[0]
                if sp_f: features = {k: sp_f.get(k) or random.uniform(0.1, 0.9) for k in
                                     ['danceability', 'energy', 'valence', 'acousticness', 'liveness']}
            except:
                pass
            if not features: features = {k: random.uniform(0.1, 0.9) for k in
                                         ['danceability', 'energy', 'valence', 'acousticness', 'liveness']}

        track_info.update(
            {'cover_url': cover_url, 'release_date': release_date, 'preview_url': preview_url, 'features': features})

        user_id = session.get('user_id')
        exact_keyword = f"{track_info['name']} {track_info['artist']}"

        if user_id:
            existing = SearchHistory.query.filter_by(user_id=user_id, keyword=exact_keyword,
                                                     search_type='track').first()
            if existing:
                existing.created_at = datetime.utcnow()
            else:
                db.session.add(SearchHistory(user_id=user_id, keyword=exact_keyword, search_type='track'))
            db.session.commit()

        is_favorited = False
        if user_id:
            user = User.query.get(user_id)
            if user:
                is_favorited = user.fav_tracks.filter_by(track_id=track_id).first() is not None
        track_info['is_favorited'] = is_favorited

        similar_tracks = []
        if features['energy'] > 0:
            sample = SpotifyTrack.query.filter(SpotifyTrack.track_id != track_id,
                                               SpotifyTrack.energy.isnot(None)).order_by(db.func.rand()).limit(
                1000).all()
            t_vec = [features['energy'], features['danceability'], features['valence'], features['acousticness'],
                     features['liveness']]
            dists = [(distance.euclidean(t_vec,
                                         [s.energy or 0, s.danceability or 0, s.valence or 0, s.acousticness or 0,
                                          s.liveness or 0]), s) for s in sample]
            dists.sort(key=lambda x: x[0])
            similar_tracks = [
                {'id': t.track_id, 'name': t.track_name, 'artist': t.artists.strip("[]'\"") if t.artists else "未知",
                 'album': t.album_name} for _, t in dists[:5]]

        return jsonify({'code': 200, 'data': track_info, 'similar': similar_tracks})
    except Exception as e:
        return jsonify({'code': 500, 'msg': f'错误: {e}'})


# 4. 获取随机榜单推荐单曲列表
@search_bp.route('/random_leaderboard_tracks', methods=['GET'])
@login_required
def get_random_leaderboard_tracks():
    try:
        tracks = LeaderboardTrack.query.order_by(func.rand()).limit(40).all()
        seen = set()
        result = []
        for t in tracks:
            key = f"{t.title} {t.artist}"
            if key not in seen:
                seen.add(key)
                result.append({'title': t.title, 'artist': t.artist, 'cover_url': t.cover_url})
            if len(result) >= 20: break
        return jsonify({'code': 200, 'data': result})
    except Exception as e:
        return jsonify({'code': 500, 'msg': f'获取推荐失败: {str(e)}'})


# 5. 搜索并获取艺人的详细信息
@search_bp.route('/search_artist', methods=['GET'])
@login_required
def search_artist():
    query, exact_id = request.args.get('q'), request.args.get('id')
    if not query and not exact_id: return jsonify({'code': 400, 'msg': '条件为空'})

    user_id = session.get('user_id')

    if query and user_id:
        existing = SearchHistory.query.filter_by(user_id=user_id, keyword=query, search_type='artist').first()
        if existing:
            existing.created_at = datetime.utcnow()
        else:
            db.session.add(SearchHistory(user_id=user_id, keyword=query, search_type='artist'))
        db.session.commit()

    try:
        artist_id = exact_id
        if not artist_id:
            items = sp.search(q=query, type='artist', limit=1)['artists']['items']
            if not items: return jsonify({'code': 404, 'msg': '未找到艺人'})
            artist_id = items[0]['id']

        is_favorited = False
        if user_id:
            user = User.query.get(user_id)
            if user:
                is_favorited = user.fav_artists.filter_by(artist_id=artist_id).first() is not None

        cache = Artist.query.filter_by(artist_id=artist_id).first()
        is_cache_valid = False
        if cache and (datetime.utcnow() - cache.updated_at).total_seconds() < 86400:
            if (cache.image_url and cache.top_tracks_json and cache.top_tracks_json != '[]' and
                    cache.similar_artists_json and cache.similar_artists_json != '[]' and
                    cache.albums_json and cache.albums_json != '[]'):
                is_cache_valid = True

        if is_cache_valid:
            return jsonify({'code': 200, 'data': {
                'id': artist_id,
                'name': cache.name, 'listeners': f"{cache.listeners:,}",
                'genres': [cache.main_genre] if cache.main_genre else [],
                'image_url': cache.image_url,
                'tags_data': [{'name': t.strip()} for t in cache.tags.split(',')] if cache.tags else [],
                'top_tracks': json.loads(cache.top_tracks_json) if isinstance(cache.top_tracks_json,
                                                                              str) else cache.top_tracks_json,
                'similar_artists': json.loads(cache.similar_artists_json) if isinstance(cache.similar_artists_json,
                                                                                        str) else cache.similar_artists_json,
                'albums': json.loads(cache.albums_json) if isinstance(cache.albums_json, str) else cache.albums_json,
                'is_favorited': is_favorited
            }, 'msg': '来自完整缓存'})

        artist = sp.artist(artist_id)
        artist_name, artist_image = artist['name'], artist['images'][0]['url'] if artist['images'] else ''
        genres_list = artist.get('genres', [])
        main_genre = genres_list[0] if genres_list else '流行 (Pop)'

        listeners_int, similar_artists, tags_str, lf_top_tracks = 0, [], "", []
        try:
            lf_artist = network.get_artist(artist_name)
            listeners_int = lf_artist.get_listener_count() * 100
            similar_artists = [{"name": sim.item.get_name()} for sim in lf_artist.get_similar(limit=5)]
            tags_str = ", ".join([tag.item.get_name() for tag in lf_artist.get_top_tags(limit=5)])
            lf_top_tracks = lf_artist.get_top_tracks(limit=5)
        except Exception:
            pass

        formatted_tracks = []
        if lf_top_tracks:
            for lf_track in lf_top_tracks:
                sp_res = sp.search(q=f"track:{lf_track.item.get_title()} artist:{artist_name}", type='track', limit=1)
                if sp_res['tracks']['items']:
                    t = sp_res['tracks']['items'][0]
                    formatted_tracks.append({
                        'track_id': t['id'], 'name': t['name'], 'album_name': t['album']['name'],
                        'play_count': int(lf_track.weight),
                        'duration': f"{int((t['duration_ms'] / 60000))}:{int((t['duration_ms'] / 1000) % 60):02d}",
                        'cover_url': t['album']['images'][0]['url'] if t['album']['images'] else ''
                    })
        else:
            sp_fallback = sp.search(q=f'artist:"{artist_name}"', type='track', limit=5)
            for t in sp_fallback['tracks']['items']:
                formatted_tracks.append({
                    'track_id': t['id'], 'name': t['name'], 'album_name': t['album']['name'],
                    'play_count': random.randint(800000, 5000000),
                    'duration': f"{int((t['duration_ms'] / 60000))}:{int((t['duration_ms'] / 1000) % 60):02d}",
                    'cover_url': t['album']['images'][0]['url'] if t['album']['images'] else ''
                })

        artist_albums = []
        try:
            seen_names = set()
            for al in sp.artist_albums(artist_id, album_type='album,single', limit=10)['items']:
                if al['name'] not in seen_names:
                    seen_names.add(al['name'])
                    artist_albums.append({
                        'id': al['id'], 'name': al['name'],
                        'release_year': al['release_date'][:4] if al['release_date'] else '未知',
                        'cover_url': al['images'][0]['url'] if al['images'] else '', 'type': al['album_type'].upper()
                    })
        except Exception:
            pass

        if cache:
            cache.name, cache.listeners, cache.main_genre, cache.image_url, cache.tags = artist_name, listeners_int, main_genre, artist_image, tags_str
            cache.top_tracks_json = formatted_tracks
            cache.similar_artists_json = similar_artists
            cache.albums_json = artist_albums
            cache.updated_at = datetime.utcnow()
        else:
            db.session.add(Artist(artist_id=artist_id, name=artist_name, listeners=listeners_int, main_genre=main_genre,
                                  image_url=artist_image, tags=tags_str, top_tracks_json=formatted_tracks,
                                  similar_artists_json=similar_artists,
                                  albums_json=artist_albums))
        db.session.commit()

        return jsonify({'code': 200, 'data': {
            'id': artist_id,
            'name': artist_name, 'listeners': f"{listeners_int:,}",
            'genres': genres_list[:3] if genres_list else ['流行 (Pop)'],
            'image_url': artist_image,
            'tags_data': [{'name': t.strip()} for t in tags_str.split(',')] if tags_str else [],
            'top_tracks': formatted_tracks, 'similar_artists': similar_artists, 'albums': artist_albums,
            'is_favorited': is_favorited
        }})
    except Exception as e:
        return jsonify({'code': 500, 'msg': 'API 请求失败'})


# 6. 获取艺人搜索下拉建议列表
@search_bp.route('/suggest_artist', methods=['GET'])
@login_required
def suggest_artist():
    query = request.args.get('q')
    if not query: return jsonify({'code': 400, 'data': []})
    try:
        items = sp.search(q=query, type='artist', limit=5)['artists']['items']
        return jsonify({'code': 200, 'data': [
            {'name': i['name'], 'id': i['id'], 'avatar_url': i['images'][0]['url'] if i['images'] else ''} for i in
            items]})
    except:
        return jsonify({'code': 500, 'data': []})


# 7. 获取指定艺人的封面图片URL
@search_bp.route('/get_artist_image', methods=['GET'])
@login_required
def get_artist_image():
    artist_name = request.args.get('name')
    if not artist_name: return jsonify({'code': 400, 'msg': '缺少艺人名称'})
    try:
        items = sp.search(q=artist_name, type='artist', limit=1)['artists']['items']
        return jsonify(
            {'code': 200, 'data': {'image_url': items[0]['images'][0]['url'] if items and items[0]['images'] else ''}})
    except:
        return jsonify({'code': 500, 'msg': '请求失败'})


# 8. 获取专辑搜索下拉建议列表
@search_bp.route('/suggest_album', methods=['GET'])
@login_required
def suggest_album():
    query = request.args.get('q')
    if not query: return jsonify({'code': 400, 'data': []})
    try:
        items = sp.search(q=query, type='album', limit=5)['albums']['items']
        return jsonify({'code': 200, 'data': [{'name': i['name'], 'artist': i['artists'][0]['name'], 'id': i['id'],
                                               'cover_url': i['images'][0]['url'] if i['images'] else ''} for i in
                                              items]})
    except:
        return jsonify({'code': 500, 'data': []})


# 9. 搜索并获取专辑的详细信息
@search_bp.route('/search_album', methods=['GET'])
@login_required
def search_album():
    query = request.args.get('q')
    exact_id = request.args.get('id')

    if not query and not exact_id:
        return jsonify({'code': 400, 'msg': '条件为空'})

    user_id = session.get('user_id')
    if query and user_id:
        existing = SearchHistory.query.filter_by(user_id=user_id, keyword=query, search_type='album').first()
        if existing:
            existing.created_at = datetime.utcnow()
        else:
            db.session.add(SearchHistory(user_id=user_id, keyword=query, search_type='album'))
        db.session.commit()

    try:
        cache = None
        if exact_id:
            cache = Album.query.get(exact_id)
        elif query:
            cache = Album.query.filter(Album.name.ilike(f"%{query}%")).first()

        is_favorited = False
        album_id = cache.album_id if cache else exact_id
        if not album_id and not cache:
            sp_res = sp.search(q=query, type='album', limit=1)['albums']['items']
            if sp_res:
                album_id = sp_res[0]['id']

        if user_id and album_id:
            user = User.query.get(user_id)
            if user:
                is_favorited = user.fav_albums.filter_by(album_id=album_id).first() is not None

        if cache:
            return jsonify({'code': 200, 'data': {
                'id': cache.album_id,
                'name': cache.name,
                'artist': cache.artist or "未知艺人",
                'release_date': cache.release_date,
                'total_tracks': cache.total_tracks,
                'image_url': cache.image_url,
                'tracks': cache.tracks_json if cache.tracks_json else [],
                'features': {
                    'danceability': cache.danceability or 0,
                    'energy': cache.energy or 0,
                    'acousticness': cache.acousticness or 0,
                    'valence': cache.valence or 0,
                    'liveness': cache.liveness or 0
                },
                'similar_albums': cache.similar_albums_json if cache.similar_albums_json else [],
                'total_playcount': cache.total_playcount or 0,
                'is_favorited': is_favorited
            }})

        album_detail = sp.album(album_id)
        artist_id = album_detail['artists'][0]['id']
        artist_name = album_detail['artists'][0]['name']
        album_name = album_detail['name']

        album_playcount = 0
        similar_albums = []
        try:
            lf_album = network.get_album(artist_name, album_name)
            album_playcount = int(lf_album.get_playcount()) * 100
            for sim in network.get_artist(artist_name).get_similar(limit=5):
                sim_sp = sp.search(q=f'artist:"{sim.item.get_name()}"', type='album', limit=1)
                if sim_sp['albums']['items']:
                    sim_al = sim_sp['albums']['items'][0]
                    similar_albums.append({
                        'id': sim_al['id'], 'name': sim_al['name'], 'artist': sim.item.get_name(),
                        'cover_url': sim_al['images'][0]['url'] if sim_al['images'] else ''
                    })
        except Exception as e:
            pass

        tracks_simplified = album_detail['tracks']['items'][:50]
        formatted_tracks = []
        for track in tracks_simplified:
            play_count = int((album_playcount / len(tracks_simplified)) * random.uniform(0.8,
                                                                                         1.2)) if album_playcount > 0 else random.randint(
                100000, 5000000)
            formatted_tracks.append({
                'track_number': track['track_number'],
                'name': track['name'],
                'duration': f"{int(track['duration_ms'] / 60000)}:{int((track['duration_ms'] / 1000) % 60):02d}",
                'play_count': play_count
            })

        final_total_playcount = album_playcount if album_playcount > 0 else sum(
            [t['play_count'] for t in formatted_tracks])

        random.seed(album_id)
        feats = {
            'danceability': round(random.uniform(40, 95), 1),
            'energy': round(random.uniform(50, 98), 1),
            'acousticness': round(random.uniform(5, 60), 1),
            'valence': round(random.uniform(30, 90), 1),
            'liveness': round(random.uniform(10, 40), 1)
        }

        if not Artist.query.get(artist_id):
            db.session.add(Artist(artist_id=artist_id, name=artist_name))
            db.session.flush()

        save_data = {
            'name': album_name, 'artist_id': artist_id, 'artist': artist_name,
            'release_date': album_detail['release_date'],
            'image_url': album_detail['images'][0]['url'] if album_detail['images'] else '',
            'total_tracks': album_detail['total_tracks'], 'total_playcount': final_total_playcount,
            'danceability': feats['danceability'], 'energy': feats['energy'],
            'acousticness': feats['acousticness'], 'valence': feats['valence'], 'liveness': feats['liveness'],
            'tracks_json': formatted_tracks, 'similar_albums_json': similar_albums,
            'updated_at': datetime.utcnow()
        }

        db.session.add(Album(album_id=album_id, **save_data))
        db.session.commit()

        return jsonify({'code': 200, 'data': {
            'id': album_id,
            'name': album_name, 'artist': artist_name, 'release_date': album_detail['release_date'],
            'total_tracks': album_detail['total_tracks'], 'image_url': save_data['image_url'],
            'tracks': formatted_tracks, 'features': feats, 'similar_albums': similar_albums,
            'total_playcount': final_total_playcount,
            'is_favorited': is_favorited
        }})
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'msg': f'搜索错误: {str(e)}'})


# 10. 获取当前登录用户的搜索历史记录
@search_bp.route('/search_history', methods=['GET'])
@login_required
def get_search_history():
    search_type = request.args.get('type', 'artist')
    user_id = session.get('user_id')
    history = SearchHistory.query.filter_by(user_id=user_id, search_type=search_type).order_by(
        SearchHistory.created_at.desc()).limit(8).all()
    return jsonify({'code': 200, 'data': [{'id': h.id, 'keyword': h.keyword} for h in history]})


# 11. 清空当前登录用户的搜索历史记录
@search_bp.route('/clear_history', methods=['POST'])
@login_required
def clear_history():
    data = request.get_json() or {}
    search_type = data.get('type', 'artist')
    user_id = session.get('user_id')
    SearchHistory.query.filter_by(user_id=user_id, search_type=search_type).delete()
    db.session.commit()
    return jsonify({'code': 200, 'msg': '历史记录已清空'})


# 12. 获取艺人页面的榜单及流派数据总览
@search_bp.route('/artist_page_overview', methods=['GET'])
@login_required
def get_artist_page_overview():
    try:
        latest_board = Leaderboard.query.order_by(Leaderboard.board_date.desc()).first()
        if not latest_board: return jsonify({'code': 404, 'msg': '暂无榜单数据，请先爬取'})

        latest_date = latest_board.board_date
        boards_today = Leaderboard.query.filter_by(board_date=latest_date).all()
        regions = [b.region_name for b in boards_today]

        final_artists = []
        seen_names = set()
        for region in regions:
            artists = LeaderboardArtist.query.join(Leaderboard).filter(Leaderboard.region_name == region,
                                                                       Leaderboard.board_date == latest_date).order_by(
                LeaderboardArtist.rank.asc()).limit(3).all()
            for a in artists:
                if a.name not in seen_names and a.name != "Unknown Artist":
                    seen_names.add(a.name)
                    final_artists.append(a)
                if len(final_artists) >= 10: break
            if len(final_artists) >= 10: break

        if len(final_artists) < 10:
            more_artists = LeaderboardArtist.query.join(Leaderboard).filter(
                Leaderboard.board_date == latest_date).order_by(LeaderboardArtist.rank.asc()).limit(15).all()
            for a in more_artists:
                if a.name not in seen_names and a.name != "Unknown Artist":
                    seen_names.add(a.name)
                    final_artists.append(a)
                if len(final_artists) >= 10: break

        final_artists = final_artists[:10]
        db_artists = Artist.query.filter(Artist.name.in_([a.name for a in final_artists])).all()
        artist_meta_map = {db_a.name: {'genre': db_a.main_genre, 'listeners': db_a.listeners} for db_a in db_artists}

        pop_count = random.randint(4, 6)
        must_haves = ['Rock', 'Electronic', 'Rap']
        others = ['R&B', 'Indie', 'Hip-Hop', 'Latin']
        dynamic_genres = ['Pop'] * pop_count
        for i in range(10 - pop_count):
            dynamic_genres.append(must_haves[i] if i < len(must_haves) else random.choice(others))
        random.shuffle(dynamic_genres)

        artist_list = []
        genre_counts = {}
        for idx, a in enumerate(final_artists):
            meta = artist_meta_map.get(a.name, {})
            real_genre = meta.get('genre')
            genre = real_genre if (real_genre and real_genre not in ['Pop', 'Unknown']) else (
                dynamic_genres[idx] if idx < len(dynamic_genres) else 'Pop')
            base_listeners = meta.get('listeners')
            listeners = base_listeners if (base_listeners and base_listeners > 0) else (a.popularity * random.randint(
                85000, 115000)) + random.randint(10000, 99999)
            artist_list.append({'name': a.name, 'image_url': a.avatar, 'listeners': listeners, 'genre': genre})
            genre_counts[genre] = genre_counts.get(genre, 0) + 1

        return jsonify({'code': 200, 'data': {'artists': artist_list,
                                              'genres': [{'name': k, 'value': v} for k, v in genre_counts.items()]}})
    except Exception as e:
        return jsonify({'code': 500, 'msg': f'获取总览失败: {str(e)}'})


# 13. 获取专辑页面的雷达图及推荐专辑总览数据
@search_bp.route('/album_page_overview', methods=['GET'])
@login_required
def get_album_page_overview():
    try:
        albums_query = Album.query.order_by(func.rand()).limit(10).all()
        if not albums_query: return jsonify({'code': 404, 'msg': '数据库中暂无专辑数据'})

        top_albums = []
        feats = {'dance': 0, 'energy': 0, 'valence': 0, 'acoustic': 0, 'live': 0}
        valid_count = 0
        for alb in albums_query:
            artist_display = getattr(alb, 'artist_name', None) or getattr(alb, 'artist', None) or "未知艺人"
            cover = getattr(alb, 'image_url', None)
            cover_url = cover if cover else f"https://api.dicebear.com/7.x/identicon/svg?seed={alb.name}"
            d, e, a, v, l = alb.danceability or 0, alb.energy or 0, alb.acousticness or 0, alb.valence or 0, alb.liveness or 0

            top_albums.append({
                'name': alb.name, 'artist': artist_display, 'popularity': 'Discovery', 'cover_url': cover_url,
                'danceability': d, 'energy': e, 'acousticness': a, 'valence': v, 'liveness': l
            })
            feats['dance'] += d;
            feats['energy'] += e;
            feats['valence'] += v;
            feats['acoustic'] += a;
            feats['live'] += l
            valid_count += 1

        radar_values = [50, 50, 50, 50, 50]
        if valid_count > 0:
            radar_values = [round(feats['dance'] / valid_count, 1), round(feats['energy'] / valid_count, 1),
                            round(feats['valence'] / valid_count, 1), round(feats['acoustic'] / valid_count, 1),
                            round(feats['live'] / valid_count, 1)]

        return jsonify({'code': 200, 'data': {'albums': top_albums, 'radar': radar_values}})
    except Exception as e:
        return jsonify({'code': 500, 'msg': f"加载失败: {str(e)}"})


# 14. 收藏或取消收藏指定艺人
@search_bp.route('/toggle_favorite', methods=['POST'])
@login_required
def toggle_favorite():
    data = request.json
    artist_name = data.get('artist_name')
    artist_id = data.get('artist_id')

    if not artist_name: return jsonify({'code': 400, 'msg': '缺少艺人名称'})

    user_id = session.get('user_id')
    user = User.query.get(user_id)

    artist = Artist.query.filter_by(artist_id=artist_id).first() if artist_id else Artist.query.filter_by(
        name=artist_name).first()

    if not artist: return jsonify({'code': 404, 'msg': '该艺人还未收录到核心库'})

    fav_record = user.fav_artists.filter_by(artist_id=artist.artist_id).first()

    try:
        if fav_record:
            db.session.delete(fav_record)
            action = 'removed'
        else:
            new_fav = FavoriteArtist(user_id=user.id, artist_id=artist.artist_id, artist_name=artist.name)
            db.session.add(new_fav)
            action = 'added'

        db.session.commit()
        return jsonify({'code': 200, 'data': {'status': action}, 'msg': '操作成功'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'msg': '数据库写入失败'})


# 15. 收藏或取消收藏指定专辑
@search_bp.route('/toggle_favorite_album', methods=['POST'])
@login_required
def toggle_favorite_album():
    data = request.json
    album_id = data.get('album_id')
    album_name = data.get('album_name')

    if not album_id: return jsonify({'code': 400, 'msg': '缺少专辑ID'})

    user_id = session.get('user_id')
    user = User.query.get(user_id)

    fav_record = user.fav_albums.filter_by(album_id=album_id).first()

    try:
        if fav_record:
            db.session.delete(fav_record)
            action = 'removed'
        else:
            new_fav = FavoriteAlbum(user_id=user.id, album_id=album_id, album_name=album_name or '未知专辑')
            db.session.add(new_fav)
            action = 'added'

        db.session.commit()
        return jsonify({'code': 200, 'data': {'status': action}, 'msg': '操作成功'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'msg': '数据库写入失败'})


# 16. 收藏或取消收藏指定单曲
@search_bp.route('/toggle_favorite_track', methods=['POST'])
@login_required
def toggle_favorite_track():
    data = request.json
    track_id = data.get('track_id')
    track_name = data.get('track_name')

    if not track_id: return jsonify({'code': 400, 'msg': '缺少单曲ID'})

    user_id = session.get('user_id')
    user = User.query.get(user_id)

    fav_record = user.fav_tracks.filter_by(track_id=track_id).first()

    try:
        if fav_record:
            db.session.delete(fav_record)
            action = 'removed'
        else:
            new_fav = FavoriteTrack(user_id=user.id, track_id=track_id, track_name=track_name or '未知单曲')
            db.session.add(new_fav)
            action = 'added'

        db.session.commit()
        return jsonify({'code': 200, 'data': {'status': action}, 'msg': '操作成功'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'msg': '数据库写入失败'})


# 17. 获取指定单曲的历史榜单排名趋势
@search_bp.route('/track_trend', methods=['GET'])
@login_required
def get_track_trend():
    track_name = request.args.get('name')
    artist_name = request.args.get('artist')
    if not track_name:
        return jsonify({'code': 400, 'msg': '缺少单曲名称'})

    try:
        query = LeaderboardTrack.query.filter(LeaderboardTrack.title == track_name)
        if artist_name:
            query = query.filter(LeaderboardTrack.artist.like(f"%{artist_name}%"))

        records = query.all()

        if not records:
            return jsonify({'code': 200, 'data': []})

        date_rank_map = {}
        for r in records:
            parts = r.board_key.split('_')
            if len(parts) >= 2:
                date_str = parts[-1]
                if date_str not in date_rank_map or r.rank < date_rank_map[date_str]:
                    date_rank_map[date_str] = r.rank

        sorted_dates = sorted(date_rank_map.keys())[-14:]
        trend_data = [{'date': d[5:], 'rank': date_rank_map[d]} for d in sorted_dates]

        return jsonify({'code': 200, 'data': trend_data})
    except Exception as e:
        print(f"获取单曲排名趋势失败: {e}")
        return jsonify({'code': 500, 'msg': str(e)})


# 18. 获取当前用户的艺人收藏列表
@search_bp.route('/my_favorite_artists', methods=['GET'])
@login_required
def get_my_favorite_artists():
    user_id = session.get('user_id')

    favs = FavoriteArtist.query.filter_by(user_id=user_id).order_by(FavoriteArtist.created_at.desc()).all()

    if not favs: return jsonify({'code': 200, 'data': []})

    artist_ids = [f.artist_id for f in favs]
    artists = Artist.query.filter(Artist.artist_id.in_(artist_ids)).all()
    art_map = {a.artist_id: a for a in artists}

    result = []
    for f in favs:
        a = art_map.get(f.artist_id)
        if a:
            result.append({
                'id': a.artist_id,
                'name': a.name,
                'image_url': a.image_url or 'https://via.placeholder.com/150',
                'genres': a.main_genre,
                'listeners': a.listeners,
                'favorited_at': f.created_at.strftime('%Y-%m-%d')
            })

    return jsonify({'code': 200, 'data': result})


# 19. 获取当前用户的专辑收藏列表
@search_bp.route('/my_favorite_albums', methods=['GET'])
@login_required
def get_my_favorite_albums():
    user_id = session.get('user_id')
    favs = FavoriteAlbum.query.filter_by(user_id=user_id).order_by(FavoriteAlbum.created_at.desc()).all()

    if not favs: return jsonify({'code': 200, 'data': []})

    album_ids = [f.album_id for f in favs]
    albums = Album.query.filter(Album.album_id.in_(album_ids)).all()
    alb_map = {a.album_id: a for a in albums}

    result = []
    for f in favs:
        a = alb_map.get(f.album_id)
        if a:
            result.append({
                'id': a.album_id,
                'name': a.name,
                'artist': a.artist,
                'image_url': a.image_url or 'https://via.placeholder.com/150',
                'release_date': a.release_date,
                'favorited_at': f.created_at.strftime('%Y-%m-%d')
            })

    return jsonify({'code': 200, 'data': result})


# 20. 获取当前用户的单曲收藏列表
@search_bp.route('/my_favorite_tracks', methods=['GET'])
@login_required
def get_my_favorite_tracks():
    user_id = session.get('user_id')
    favs = FavoriteTrack.query.filter_by(user_id=user_id).order_by(FavoriteTrack.created_at.desc()).all()

    if not favs: return jsonify({'code': 200, 'data': []})

    track_ids = [f.track_id for f in favs]
    tracks = SpotifyTrack.query.filter(SpotifyTrack.track_id.in_(track_ids)).all()
    trk_map = {t.track_id: t for t in tracks}

    result = []
    for f in favs:
        t = trk_map.get(f.track_id)
        if t:
            result.append({
                'id': t.track_id,
                'name': t.track_name,
                'artist': t.artists.strip("[]'\"") if t.artists else '未知',
                'album': t.album_name,
                'cover_url': 'https://via.placeholder.com/150?text=Track',
                'favorited_at': f.created_at.strftime('%Y-%m-%d')
            })

    return jsonify({'code': 200, 'data': result})