# -*- coding: utf-8 -*-
from datetime import datetime
from exts import db


# ==========================================
# 🌟 全新升级：三大收藏关联模型 (Association Objects)
# ==========================================
class FavoriteArtist(db.Model):
    __tablename__ = 'favorite_artists'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    artist_id = db.Column(db.String(50), db.ForeignKey('artists.artist_id', ondelete='CASCADE'), primary_key=True)
    artist_name = db.Column(db.String(255))  # 额外记录的艺人名称
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class FavoriteAlbum(db.Model):
    __tablename__ = 'favorite_albums'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    album_id = db.Column(db.String(50), db.ForeignKey('albums.album_id', ondelete='CASCADE'), primary_key=True)
    album_name = db.Column(db.String(255))  # 额外记录的专辑名称
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class FavoriteTrack(db.Model):
    __tablename__ = 'favorite_tracks'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    track_id = db.Column(db.String(50), db.ForeignKey('spotify_tracks.track_id', ondelete='CASCADE'), primary_key=True)
    track_name = db.Column(db.String(255))  # 额外记录的单曲名称
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), default='user')

    # 关系1：搜索历史
    searches = db.relationship('SearchHistory', backref='user', lazy='dynamic', cascade="all, delete-orphan")

    # 🌟 关系2：分别连接到三大收藏表
    fav_artists = db.relationship('FavoriteArtist', backref='user', lazy='dynamic', cascade="all, delete-orphan")
    fav_albums = db.relationship('FavoriteAlbum', backref='user', lazy='dynamic', cascade="all, delete-orphan")
    fav_tracks = db.relationship('FavoriteTrack', backref='user', lazy='dynamic', cascade="all, delete-orphan")


class SpotifyTrack(db.Model):
    __tablename__ = 'spotify_tracks'
    track_id = db.Column(db.String(50), primary_key=True)

    artists = db.Column(db.String(500), index=True)
    track_name = db.Column(db.String(255), index=True)
    album_name = db.Column(db.String(255))

    popularity = db.Column(db.Integer)
    duration_ms = db.Column(db.Integer)
    explicit = db.Column(db.Integer)
    danceability = db.Column(db.Float)
    energy = db.Column(db.Float)
    key = db.Column(db.Integer)
    loudness = db.Column(db.Float)
    mode = db.Column(db.Integer)
    speechiness = db.Column(db.Float)
    acousticness = db.Column(db.Float)
    instrumentalness = db.Column(db.Float)
    liveness = db.Column(db.Float)
    valence = db.Column(db.Float)
    tempo = db.Column(db.Float)


class Leaderboard(db.Model):
    __tablename__ = 'leaderboards'
    board_key = db.Column(db.String(100), primary_key=True)
    region_name = db.Column(db.String(50), nullable=False, index=True)
    board_date = db.Column(db.String(20), nullable=False, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tracks = db.relationship('LeaderboardTrack', backref='leaderboard_ref', lazy='dynamic',
                             cascade="all, delete-orphan")
    artists = db.relationship('LeaderboardArtist', backref='leaderboard_ref', lazy='dynamic',
                              cascade="all, delete-orphan")


class LeaderboardArtist(db.Model):
    __tablename__ = 'leaderboard_artists'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    board_key = db.Column(db.String(100), db.ForeignKey('leaderboards.board_key'), nullable=False, index=True)
    artist_id = db.Column(db.String(50), db.ForeignKey('artists.artist_id', ondelete='SET NULL'), nullable=True)

    rank = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(255), nullable=False, index=True)
    avatar = db.Column(db.Text)
    popularity = db.Column(db.Integer)


class LeaderboardTrack(db.Model):
    __tablename__ = 'leaderboard_tracks'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    board_key = db.Column(db.String(100), db.ForeignKey('leaderboards.board_key'), nullable=False, index=True)

    rank = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(255), nullable=False)
    artist = db.Column(db.String(500))
    artist_id = db.Column(db.String(50), db.ForeignKey('artists.artist_id', ondelete='SET NULL'), nullable=True)

    cover_url = db.Column(db.Text)
    streams = db.Column(db.String(50))
    peak = db.Column(db.String(20))
    previous_rank = db.Column(db.String(20))
    streak = db.Column(db.String(20))


class Artist(db.Model):
    __tablename__ = 'artists'
    artist_id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False, index=True)
    listeners = db.Column(db.BigInteger, default=0)
    main_genre = db.Column(db.String(50))
    image_url = db.Column(db.Text)

    tags = db.Column(db.JSON)
    top_tracks_json = db.Column(db.JSON)
    similar_artists_json = db.Column(db.JSON)
    albums_json = db.Column(db.JSON)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

    albums = db.relationship('Album', backref='author', lazy=True)


class Album(db.Model):
    __tablename__ = 'albums'
    album_id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    artist_id = db.Column(db.String(50), db.ForeignKey('artists.artist_id'), nullable=False)

    artist = db.Column(db.String(255), index=True)
    release_date = db.Column(db.String(20))
    image_url = db.Column(db.Text)
    total_tracks = db.Column(db.Integer)
    total_playcount = db.Column(db.BigInteger, default=0)

    danceability = db.Column(db.Float)
    energy = db.Column(db.Float)
    acousticness = db.Column(db.Float)
    valence = db.Column(db.Float)
    liveness = db.Column(db.Float)

    tracks_json = db.Column(db.JSON)
    similar_albums_json = db.Column(db.JSON)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)


class Region(db.Model):
    __tablename__ = 'regions'
    region_name = db.Column(db.String(50), primary_key=True)
    main_genre = db.Column(db.String(50))
    listeners = db.Column(db.BigInteger, default=0)
    top_tracks_json = db.Column(db.JSON)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)


class DashboardCache(db.Model):
    __tablename__ = 'dashboard_cache'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    cache_key = db.Column(db.String(50), unique=True, nullable=False)
    data_json = db.Column(db.JSON, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)


class SearchHistory(db.Model):
    __tablename__ = 'search_history'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    keyword = db.Column(db.String(100), nullable=False)
    search_type = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)