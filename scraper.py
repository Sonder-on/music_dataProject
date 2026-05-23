# -*- coding: utf-8 -*-
import os
import time
import re
import threading
import logging
from datetime import datetime
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from models import Leaderboard, LeaderboardArtist, LeaderboardTrack
from exts import db


# 1. 过滤 Selenium 底层网络与统计报错日志
os.environ["SE_DISABLE_TELEMETRY"] = "true"
os.environ['WDM_LOG'] = '0'
logging.getLogger('selenium.webdriver.common.selenium_manager').setLevel(logging.ERROR)
logging.getLogger('selenium.webdriver.remote.remote_connection').setLevel(logging.ERROR)

scraper_lock = threading.Lock()


# 2. 初始化核心无头浏览器驱动并隐藏自动化特征
def get_headless_driver():
    USER_DATA_DIR = r"./scripts/SeleniumUserData"

    chrome_options = Options()
    chrome_options.add_argument(f"--user-data-dir={USER_DATA_DIR}")
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--remote-debugging-port=9222")

    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)

    driver = webdriver.Chrome(options=chrome_options)

    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    })
    return driver


# 3. 抓取并解析指定地址的单曲排行榜数据
def scrape_leaderboard_via_selenium(url):
    page_source = ""
    driver = None
    try:
        with scraper_lock:
            driver = get_headless_driver()
            print(f"🕸️ 正在后台访问单曲榜单: {url}")
            driver.get(url)
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "tr[data-encore-id='tableRow']")))
            time.sleep(1)
            page_source = driver.page_source
    except Exception as e:
        print(f"❌ 浏览器渲染错误: {e}")
        return []
    finally:
        if driver: driver.quit()

    if not page_source: return []
    soup = BeautifulSoup(page_source, 'html.parser')
    rows = soup.find_all('tr', attrs={'data-encore-id': 'tableRow'})
    scraped_data = []

    for i, row in enumerate(rows):
        song_info = {}
        try:
            title_tag = row.find(lambda tag: tag.name in ['span', 'div'] and any(
                'StyledTruncatedTitle' in c for c in tag.get('class', [])))
            sub_title_tag = row.find('a', href=re.compile(r'/artist/'))
            if not title_tag: continue

            main_text = title_tag.text.strip()
            if sub_title_tag:
                song_info['title'] = main_text
                song_info['artist'] = sub_title_tag.text.strip()
                match = re.search(r'/artist/([a-zA-Z0-9]+)', sub_title_tag.get('href', ''))
                song_info['artist_id'] = match.group(1) if match else None
            else:
                if main_text == "Unknown" or not main_text: continue
                song_info['title'] = main_text
                song_info['artist'] = "Spotify Artist"
                song_info['artist_id'] = None

            img_tag = row.find('img')
            song_info['cover_url'] = img_tag['src'] if img_tag and 'src' in img_tag.attrs else ''

            cells = row.find_all('td', class_=lambda c: c and 'RightTableCell' in c)
            if len(cells) >= 4:
                song_info['Peak'], song_info['Prev'], song_info['Streak'], song_info['Streams'] = [c.text.strip() for c
                                                                                                   in cells[:4]]
            else:
                continue

            rank_span = row.find('span', attrs={'aria-label': 'Current position'})
            song_info['Rank'] = rank_span.text.strip() if rank_span else str(len(scraped_data) + 1)

            scraped_data.append(song_info)
            if len(scraped_data) >= 50: break
        except Exception:
            continue
    return scraped_data


# 4. 抓取并解析指定地址的最热艺人排行榜数据
def scrape_leaderboard_artists_via_selenium(url):
    page_source = ""
    driver = None
    try:
        with scraper_lock:
            driver = get_headless_driver()
            print(f"🕸️ 正在后台访问艺人榜单: {url}")
            driver.get(url)
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "tr[data-encore-id='tableRow']")))
            time.sleep(1.5)
            page_source = driver.page_source
    except Exception as e:
        print(f"❌ 浏览器渲染艺人列表错误: {e}")
        return []
    finally:
        if driver: driver.quit()

    if not page_source: return []
    soup = BeautifulSoup(page_source, 'html.parser')
    rows = soup.find_all('tr', attrs={'data-encore-id': 'tableRow'})
    scraped_artists = []

    for i in range(min(20, len(rows) - 1)):
        row = rows[i + 1]
        try:
            rank_span = row.find('span', attrs={'aria-label': 'Current position'})
            rank = int(rank_span.text.strip()) if rank_span else (i + 1)
            img_tag = row.find('img')

            name = "Unknown Artist"
            name_tag = row.find(lambda tag: tag.name == 'span' and tag.get('class') and any(
                'TruncatedTitle' in c for c in tag.get('class')))
            if name_tag and name_tag.text.strip():
                name = name_tag.text.strip()
            else:
                wrapper = row.find(lambda tag: tag.name == 'div' and tag.get('class') and any(
                    'Wrapper' in c for c in tag.get('class')))
                if wrapper and wrapper.text.strip():
                    name = wrapper.text.strip()

            scraped_artists.append({
                'avatar': img_tag['src'] if img_tag and 'src' in img_tag.attrs else '',
                'name': name,
                'popularity': 100 - (rank * 2)
            })
        except Exception:
            continue
    return scraped_artists


# 5. 抓取全球范围的每日热门艺人数据
def scrape_artists_via_selenium(url="https://charts.spotify.com/charts/view/artist-global-daily/latest"):
    return scrape_leaderboard_artists_via_selenium(url)[:5]


# 6. 抓取全球范围的每周热门专辑数据
def scrape_albums_via_selenium(url="https://charts.spotify.com/charts/view/album-global-weekly/latest"):
    page_source = ""
    driver = None
    try:
        driver = get_headless_driver()
        driver.get(url)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "tr[data-encore-id='tableRow']")))
        time.sleep(2)
        page_source = driver.page_source
    except Exception:
        return []
    finally:
        if driver: driver.quit()

    if not page_source: return []
    soup = BeautifulSoup(page_source, 'html.parser')
    rows = soup.find_all('tr', attrs={'data-encore-id': 'tableRow'})
    scraped_albums = []

    for i in range(min(5, len(rows))):
        row = rows[i + 1]
        try:
            img_tag = row.find('img')
            title_tag = row.find(lambda tag: tag.name in ['span', 'a'] and any(
                'StyledTruncatedTitle' in c for c in tag.get('class', [])))
            artist_tag = row.find(
                lambda tag: tag.name == 'a' and any('StyledHyperlink' in c for c in tag.get('class', [])))
            scraped_albums.append({
                'cover': img_tag['src'] if img_tag and 'src' in img_tag.attrs else '',
                'name': title_tag.text.strip() if title_tag else "Unknown Album",
                'artist': artist_tag.text.strip() if artist_tag else "Unknown Artist"
            })
        except Exception:
            continue
    return scraped_albums


# 7. 将抓取到的榜单、单曲及艺人数据持久化写入关系型数据库
def save_leaderboard_to_db(region, date_str, tracks_list, artists_list):
    from app import create_app
    from models import Leaderboard, LeaderboardTrack, LeaderboardArtist, Artist
    from exts import db

    board_key = f"{region}_{date_str}"

    scraper_app = create_app()
    with scraper_app.app_context():
        board = Leaderboard.query.get(board_key)
        if not board:
            board = Leaderboard(board_key=board_key, region_name=region, board_date=date_str)
            db.session.add(board)
            db.session.commit()
        else:
            board.updated_at = datetime.utcnow()

        if tracks_list:
            LeaderboardTrack.query.filter_by(board_key=board_key).delete()
            for track_data in tracks_list:
                raw_artist_id = track_data.get('artist_id', '')
                artist_id = raw_artist_id if raw_artist_id else None
                artist_name = track_data.get('artist', 'Unknown')

                if artist_id:
                    exist_artist = Artist.query.get(artist_id)
                    if not exist_artist:
                        new_artist = Artist(artist_id=artist_id, name=artist_name)
                        db.session.add(new_artist)
                        try:
                            db.session.commit()
                        except Exception as e:
                            db.session.rollback()

                new_track = LeaderboardTrack(
                    board_key=board_key,
                    rank=int(track_data.get('Rank', 0)),
                    title=track_data.get('title', 'Unknown'),
                    artist=artist_name,
                    artist_id=artist_id,
                    cover_url=track_data.get('cover_url', ''),
                    streams=track_data.get('Streams', '0'),
                    peak=track_data.get('Peak', ''),
                    previous_rank=track_data.get('Prev', ''),
                    streak=track_data.get('Streak', '')
                )
                db.session.add(new_track)

        if artists_list:
            LeaderboardArtist.query.filter_by(board_key=board_key).delete()
            for index, artist_data in enumerate(artists_list):
                raw_artist_id = artist_data.get('artist_id', '')
                artist_id = raw_artist_id if raw_artist_id else None
                artist_name = artist_data.get('name', 'Unknown Artist')

                if artist_id:
                    exist_artist = Artist.query.get(artist_id)
                    if not exist_artist:
                        new_artist = Artist(artist_id=artist_id, name=artist_name)
                        db.session.add(new_artist)
                        try:
                            db.session.commit()
                        except Exception as e:
                            db.session.rollback()

                new_artist = LeaderboardArtist(
                    board_key=board_key,
                    rank=index + 1,
                    name=artist_name,
                    artist_id=artist_id,
                    avatar=artist_data.get('avatar', ''),
                    popularity=artist_data.get('popularity', 0)
                )
                db.session.add(new_artist)

        db.session.commit()
        print(f"✅ {region} 榜单 (日期: {date_str}) 数据库更新成功！")
