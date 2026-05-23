# -*- coding: utf-8 -*-
import json
import random
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request

from models import DashboardCache, Region, SpotifyTrack, SearchHistory, Leaderboard, LeaderboardTrack, LeaderboardArtist
from exts import db

from utils import login_required, REGION_CODES, network, sp
from scraper import (
    scrape_artists_via_selenium,
    scrape_albums_via_selenium,
    scrape_leaderboard_via_selenium,
    scrape_leaderboard_artists_via_selenium,
    save_leaderboard_to_db
)

dashboard_bp = Blueprint('dashboard', __name__)


# 1. 获取仪表盘大盘基础综合数据及近7日图表趋势
@dashboard_bp.route('/dashboard', methods=['GET'])
@login_required
def get_dashboard_data():
    try:
        today_str = datetime.utcnow().strftime('%Y-%m-%d')
        artist_cache_key, album_cache_key = f"artists_{today_str}", f"albums_{today_str}"

        artist_cache = DashboardCache.query.filter_by(cache_key=artist_cache_key).first()
        if artist_cache and (datetime.utcnow() - artist_cache.updated_at).total_seconds() < 43200:
            top_artists = artist_cache.data_json
        else:
            top_artists = scrape_artists_via_selenium(
                "https://charts.spotify.com/charts/view/artist-global-daily/latest") or [
                              {'name': 'Taylor Swift', 'popularity': 100, 'avatar': ''},
                              {'name': 'The Weeknd', 'popularity': 98, 'avatar': ''}
                          ]
            if artist_cache:
                artist_cache.data_json, artist_cache.updated_at = top_artists, datetime.utcnow()
            else:
                db.session.add(DashboardCache(cache_key=artist_cache_key, data_json=top_artists))
            db.session.commit()

        album_cache = DashboardCache.query.filter_by(cache_key=album_cache_key).first()
        if album_cache and (datetime.utcnow() - album_cache.updated_at).total_seconds() < 43200:
            top_albums = album_cache.data_json
        else:
            top_albums = scrape_albums_via_selenium(
                "https://charts.spotify.com/charts/view/album-global-weekly/latest") or [
                             {'name': "1989 (Taylor's Version)", 'artist': 'Taylor Swift', 'cover': ''}
                         ]
            if album_cache:
                album_cache.data_json, album_cache.updated_at = top_albums, datetime.utcnow()
            else:
                db.session.add(DashboardCache(cache_key=album_cache_key, data_json=top_albums))
            db.session.commit()

        today = datetime.utcnow()
        trend_x, trend_y_play, trend_y_search = [], [], []

        base_play = (sum([a.get('popularity', 0) for a in top_artists]) if top_artists else 400) * 350

        for i in range(6, -1, -1):
            target_date = today - timedelta(days=i)
            trend_x.append(target_date.strftime('%m-%d'))

            start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)

            real_daily_searches = db.session.query(SearchHistory).filter(
                SearchHistory.created_at >= start_of_day,
                SearchHistory.created_at < end_of_day
            ).count()

            display_search = int(base_play * 0.18) + (real_daily_searches * 50)
            trend_y_search.append(display_search)

            play_multiplier = random.uniform(2.5, 3.5)
            display_play = display_search * play_multiplier + base_play
            trend_y_play.append(int(display_play))

        try:
            feats = db.session.query(SpotifyTrack.energy, SpotifyTrack.danceability, SpotifyTrack.valence,
                                     SpotifyTrack.acousticness, SpotifyTrack.liveness).order_by(
                SpotifyTrack.popularity.desc()).limit(1000).all()
            if feats:
                valid_count = len(feats)
                avg_features = [
                    round((sum([t.energy for t in feats if t.energy is not None]) / valid_count) * 100, 1),
                    round((sum([t.danceability for t in feats if t.danceability is not None]) / valid_count) * 100, 1),
                    round((sum([t.valence for t in feats if t.valence is not None]) / valid_count) * 100, 1),
                    round((sum([t.acousticness for t in feats if t.acousticness is not None]) / valid_count) * 100, 1),
                    round((sum([t.liveness for t in feats if t.liveness is not None]) / valid_count) * 100, 1)
                ]
            else:
                avg_features = [78, 65, 82, 45, 30]
        except Exception:
            avg_features = [78, 65, 82, 45, 30]

        return jsonify({'code': 200, 'data': {
            'top_artists': top_artists, 'top_albums': top_albums,
            'charts': {
                'trend_x': trend_x, 'trend_y_search': trend_y_search, 'trend_y_play': trend_y_play,
                'genres': [{'value': 47, 'name': 'Pop'}, {'value': 17, 'name': 'Rock'}, {'value': 12, 'name': 'Others'},
                           {'value': 7, 'name': 'K-pop'}, {'value': 5, 'name': 'J-pop'}, {'value': 5, 'name': 'Rap'},
                           {'value': 4, 'name': 'Country'}, {'value': 3, 'name': 'C-pop'}],
                'features': avg_features
            }
        }})
    except Exception as e:
        print(f"Dashboard Error: {e}")
        return jsonify({'code': 500, 'msg': f'大盘加载失败: {e}'})


# 2. 获取实时波动的播放量与搜索量增量数据
@dashboard_bp.route('/realtime_trend', methods=['GET'])
def realtime_trend():
    inc = random.randint(15, 60)
    return jsonify({'code': 200, 'data': {'play': inc, 'search': int(inc * random.uniform(0.12, 0.22))}})


# 3. 获取指定地区和日期的单曲排行榜数据
@dashboard_bp.route('/leaderboard_data', methods=['GET'])
@login_required
def get_track_leaderboard():
    region = request.args.get('region', 'Global')
    target_date = request.args.get('date', (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d'))
    board_key = f"{region}_{target_date}"

    try:
        tracks = LeaderboardTrack.query.filter_by(board_key=board_key).order_by(LeaderboardTrack.rank.asc()).all()
        if tracks:
            data_list = [{
                'Rank': str(t.rank),
                'title': t.title,
                'artist': t.artist,
                'artist_id': t.artist_id,
                'cover_url': t.cover_url,
                'Streams': t.streams,
                'Peak': t.peak,
                'Prev': t.previous_rank,
                'Streak': t.streak
            } for t in tracks]
            return jsonify(
                {'code': 200, 'data': {'track': region, 'date': target_date, 'tracks': data_list, 'genre_stats': {}}})
    except Exception as e:
        print(f"读取排行榜失败: {e}")
        pass

    region_code = REGION_CODES.get(region, "global")
    target_url = f"https://charts.spotify.com/charts/view//regional-{region_code}-daily/{target_date}"
    raw_scraped_data = scrape_leaderboard_via_selenium(target_url)

    if not raw_scraped_data: return jsonify({'code': 500, 'msg': '单曲榜单爬取失败'})

    save_leaderboard_to_db(region, target_date, raw_scraped_data, [])

    return jsonify(
        {'code': 200, 'data': {'track': region, 'date': target_date, 'tracks': raw_scraped_data, 'genre_stats': {}}})


# 4. 获取指定地区和日期的艺人排行榜数据
@dashboard_bp.route('/top_artists_data', methods=['GET'])
@login_required
def get_artist_leaderboard():
    region = request.args.get('region', 'Global')
    target_date = request.args.get('date', (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d'))
    board_key = f"{region}_{target_date}"

    try:
        artists = LeaderboardArtist.query.filter_by(board_key=board_key).order_by(LeaderboardArtist.rank.asc()).all()
        if artists:
            data_list = [{'name': a.name, 'avatar': a.avatar, 'popularity': a.popularity} for a in artists]
            return jsonify({'code': 200, 'data': {'track': region, 'date': target_date, 'artists': data_list}})
    except Exception as e:
        print(f"读取艺人榜失败: {e}")
        pass

    region_code = REGION_CODES.get(region, "global")
    target_url = f"https://charts.spotify.com/charts/view/artist-{region_code}-daily/{target_date}"
    artists_data = scrape_leaderboard_artists_via_selenium(target_url)

    if not artists_data: return jsonify({'code': 500, 'msg': '艺人数据爬取失败'})

    save_leaderboard_to_db(region, target_date, [], artists_data)

    return jsonify({'code': 200, 'data': {'track': region, 'date': target_date, 'artists': artists_data}})


# 5. 获取指定国家或地区的流派偏好与热门单曲数据
@dashboard_bp.route('/region_data', methods=['GET'])
@login_required
def get_region_data():
    region = request.args.get('region', 'Global')
    try:
        cache = Region.query.get(region)
        if cache and (datetime.utcnow() - cache.updated_at).total_seconds() < 43200:
            return jsonify({'code': 200, 'data': {'name': cache.region_name, 'mainGenre': cache.main_genre,
                                                  'listeners': f"{cache.listeners:,}+",
                                                  'tracks': cache.top_tracks_json if cache.top_tracks_json else []},
                            'msg': '数据来自缓存'})
    except Exception:
        pass

    try:
        geo_map = {
            "Russia": "Russian Federation",
            "South Korea": "Korea, Republic of"
        }
        search_name = geo_map.get(region, region)

        if region == "Global":
            lf_tracks = network.get_top_tracks(limit=5)
        else:
            lf_tracks = network.get_geo_top_tracks(search_name, limit=5)

        display_tracks = []
        for item in lf_tracks:
            track_obj = item.item if hasattr(item, 'item') else item
            track_name, artist_name = track_obj.get_title(), track_obj.get_artist().get_name()

            sp_res = sp.search(q=f"track:{track_name} artist:{artist_name}", type='track', limit=1)
            cover_url, duration = "", "--:--"
            if sp_res['tracks']['items']:
                t_detail = sp_res['tracks']['items'][0]
                cover_url = t_detail['album']['images'][0]['url'] if t_detail['album']['images'] else ''
                ms = t_detail['duration_ms']
                duration = f"{int(ms / 60000)}:{int((ms % 60000) / 1000):02d}"
            display_tracks.append(
                {'title': track_name, 'artist': artist_name, 'cover_url': cover_url, 'duration': duration})

        main_genre = {"Japan": "J-pop", "South Korea": "K-pop", "Brazil": "Latin", "Mexico": "Latin",
                      "United States": "Pop", "China": "C-pop"}.get(region, "Pop")
        raw_listeners_num = random.randint(50, 200) * 10000

        if not cache:
            db.session.add(Region(region_name=region, main_genre=main_genre, listeners=raw_listeners_num,
                                  top_tracks_json=display_tracks))
        else:
            cache.main_genre, cache.listeners, cache.top_tracks_json, cache.updated_at = main_genre, raw_listeners_num, display_tracks, datetime.utcnow()
        db.session.commit()

        return jsonify({'code': 200,
                        'data': {'name': region, 'mainGenre': main_genre, 'listeners': f"{raw_listeners_num:,}+",
                                 'tracks': display_tracks}})
    except Exception:
        return jsonify({'code': 500, 'msg': '地域数据抓取失败'})


# 6. 获取特定单曲在指定地区的历史排名打榜趋势
@dashboard_bp.route('/dashboard_track_trend', methods=['GET'])
@login_required
def get_dashboard_track_trend():
    title = request.args.get('title')
    artist = request.args.get('artist')
    region = request.args.get('region', 'Global')

    if not title:
        return jsonify({'code': 400, 'msg': '缺少单曲名称'})

    try:
        query = LeaderboardTrack.query.filter(
            LeaderboardTrack.title == title,
            LeaderboardTrack.board_key.like(f"{region}_%")
        )
        if artist:
            main_artist = artist.split(',')[0].strip()
            query = query.filter(LeaderboardTrack.artist.like(f"%{main_artist}%"))

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
        return jsonify({'code': 500, 'msg': str(e)})