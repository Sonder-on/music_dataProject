# -*- coding: utf-8 -*-
import hashlib
from functools import wraps
from flask import session, redirect
import spotipy
import pylast
from spotipy.oauth2 import SpotifyClientCredentials
import config

# 初始化第三方 API 客户端
network = pylast.LastFMNetwork(api_key=config.LASTFM_API_KEY, api_secret=config.LASTFM_API_SECRET)
auth_manager = SpotifyClientCredentials(client_id=config.SPOTIFY_CLIENT_ID, client_secret=config.SPOTIFY_CLIENT_SECRET)
sp = spotipy.Spotify(auth_manager=auth_manager, requests_timeout=20, retries=3)

REGION_CODES = {
    "Global": "global", "United States": "us", "United Kingdom": "gb", "Japan": "jp",
    "South Korea": "kr", "Korea": "kr", "Taiwan": "tw", "France": "fr", "Spain": "es",
    "Brazil": "br", "Mexico": "mx", "Germany": "de", "Italy": "it", "Canada": "ca",
    "Australia": "au", "Argentina": "ar", "Singapore": "sg", "Russia": "ru",
    "China": "cn", "South Africa": "za"
}

def encrypt_md5(text):
    hl = hashlib.md5()
    hl.update(text.encode('utf-8'))
    return hl.hexdigest()

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect('/login')
        return f(*args, **kwargs)
    return decorated_function