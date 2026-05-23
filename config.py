# -*- coding: utf-8 -*-
import os

SECRET_KEY = os.urandom(24)

# 数据库配置
SQLALCHEMY_DATABASE_URI = 'mysql+pymysql://root:1234@127.0.0.1:3306/music_data_db?charset=utf8mb4'
SQLALCHEMY_TRACK_MODIFICATIONS = False

# API Keys
LASTFM_API_KEY = "注册last.fm API"
LASTFM_API_SECRET = "Last.fm API的密钥"
SPOTIFY_CLIENT_ID = 'spotify API'
SPOTIFY_CLIENT_SECRET = 'Spotify API的密钥'
