let radarChartInstance = null;
let trackTrendInstance = null;
const PAGE_TYPE = 'track';

const searchInputBox = document.getElementById('track-search-input');
const suggestionsBox = document.getElementById('search-results-dropdown');
let debounceTimer;


// 1. 页面加载初始化，绑定单曲搜索事件并解析URL参数触发精确拉取或模糊匹配
document.addEventListener('DOMContentLoaded', () => {
    initTrackSearch();

    const urlParams = new URLSearchParams(window.location.search);
    const trackId = urlParams.get('id');
    const query = urlParams.get('q');

    if (trackId) {
        fetchTrackData(trackId);
    } else if (query) {
        if (searchInputBox) searchInputBox.value = query;
        autoSearchAndLoad(query);
    }

    loadRandomTracks();
});


// 2. 初始化单曲搜索框组件，绑定回车、聚焦、按钮点击及防抖输入联想事件
function initTrackSearch() {
    if (!searchInputBox || !suggestionsBox) return;

    const searchBtn = document.getElementById('track-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const query = searchInputBox.value.trim();
            if (query) {
                if (suggestionsBox) suggestionsBox.style.display = 'none';
                autoSearchAndLoad(query);
            }
        });
    }

    searchInputBox.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = searchInputBox.value.trim();
            if (query) {
                if (suggestionsBox) suggestionsBox.style.display = 'none';
                autoSearchAndLoad(query);
            }
        }
    });

    searchInputBox.addEventListener('focus', function() {
        if (!this.value.trim()) fetchSearchHistory();
    });

    searchInputBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);

        if (!query) {
            fetchSearchHistory();
            return;
        }

        debounceTimer = setTimeout(() => {
            suggestionsBox.innerHTML = '<li style="justify-content:center; color:#888; padding: 15px;">检索中...</li>';
            suggestionsBox.style.display = 'block';

            fetch(`/api/search_track?q=${encodeURIComponent(query)}`)
                .then(res => res.json())
                .then(res => {
                    if (res.code === 200 && res.data.length > 0) {
                        renderSearchResults(res.data);
                    } else {
                        suggestionsBox.innerHTML = '<li style="justify-content:center; color:#888; padding: 15px;">未找到结果</li>';
                    }
                }).catch(() => {
                    suggestionsBox.innerHTML = '<li style="justify-content:center; color:#ff5555; padding: 15px;">请求出错</li>';
                });
        }, 400);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-section') && e.target !== searchInputBox && !suggestionsBox.contains(e.target)) {
            suggestionsBox.style.display = 'none';
        }
    });
}


// 3. 异步获取并渲染当前登录用户的单曲搜索历史记录
async function fetchSearchHistory() {
    try {
        const res = await fetch(`/api/search_history?type=${PAGE_TYPE}`);
        const result = await res.json();
        if (result.code === 200 && result.data.length > 0) {
            renderHistoryUI(result.data);
        } else {
            suggestionsBox.style.display = 'none';
        }
    } catch (e) { console.error("加载历史记录失败", e); }
}


// 4. 渲染用户的单曲搜索历史菜单项列表 UI 布局
function renderHistoryUI(historyList) {
    suggestionsBox.innerHTML = `
        <li style="padding: 12px 15px; color: #888; font-size: 13px; display: flex; justify-content: space-between; border-bottom: 1px solid #333; cursor: default; pointer-events: auto;">
            <span>🕒 最近搜索</span>
            <span style="cursor:pointer; color:#1db954; transition: 0.2s;" onmouseover="this.style.color='#1ed760'" onmouseout="this.style.color='#1db954'" onclick="clearSearchHistory(event)">清空记录</span>
        </li>
    `;
    historyList.forEach(item => {
        suggestionsBox.innerHTML += `
            <li onclick="triggerHistorySearch('${item.keyword.replace(/'/g, "\\'")}')" style="display: flex; align-items: center; cursor: pointer; padding: 10px 15px;">
                <span style="font-size: 16px; margin-right: 10px; color: #888;">🕒</span>
                <span style="color: #eee; font-size: 14px;">${item.keyword}</span>
            </li>
        `;
    });
    suggestionsBox.style.display = 'block';
}


// 5. 异步请求清空当前用户的单曲搜索历史记录
async function clearSearchHistory(event) {
    if (event) event.stopPropagation();
    try {
        await fetch('/api/clear_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: PAGE_TYPE })
        });
        suggestionsBox.style.display = 'none';
    } catch(e) {}
}


// 6. 点击搜索历史单项时填充输入框并重置进入搜索解析流
function triggerHistorySearch(keyword) {
    searchInputBox.value = keyword;
    suggestionsBox.style.display = 'none';
    autoSearchAndLoad(keyword);
}


// 7. 渲染单曲在线联想结果菜单列表并动态绑定单项点击路由更新事件
function renderSearchResults(tracks) {
    suggestionsBox.innerHTML = tracks.map(track => {
        let artist = track.artist || '未知艺人';
        if (artist.startsWith("['")) artist = artist.slice(2, -2).replace("', '", ", ");

        return `
            <li data-id="${track.id}">
                <img src="${track.cover_url || 'https://via.placeholder.com/45'}" alt="cover" style="width:40px; height:40px; border-radius:4px; object-fit:cover;">
                <div class="search-item-info" style="margin-left:12px; overflow:hidden;">
                    <div class="search-item-name" style="color:#fff; font-size:14px; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${track.name}</div>
                    <div class="search-item-artist" style="color:#888; font-size:12px; margin-top:4px;">${artist}</div>
                </div>
            </li>
        `;
    }).join('');

    const items = suggestionsBox.querySelectorAll('li[data-id]');
    items.forEach(item => {
        item.addEventListener('click', function() {
            const trackId = this.getAttribute('data-id');
            suggestionsBox.style.display = 'none';
            searchInputBox.value = this.querySelector('.search-item-name').innerText;

            const newUrl = new URL(window.location);
            newUrl.searchParams.delete('q');
            newUrl.searchParams.set('id', trackId);
            window.history.pushState({}, '', newUrl);

            fetchTrackData(trackId);
        });
    });
}


// 8. 模糊搜索匹配并自动加载解析出的首个有效单曲的主 ID
function autoSearchAndLoad(query) {
    const recommendationWrapper = document.getElementById('random-tracks-wrapper');
    if (recommendationWrapper) recommendationWrapper.style.display = 'none';

    const loadingDOM = document.getElementById('loading-state');
    const contentDOM = document.getElementById('track-content');

    if (loadingDOM) {
        loadingDOM.style.display = 'block';
        loadingDOM.innerText = `正在云端匹配歌曲: ${query} ...`;
    }
    if (contentDOM) contentDOM.style.display = 'none';

    fetch(`/api/search_track?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(res => {
            if (res.code === 200 && res.data.length > 0) {
                const firstTrackId = res.data[0].id;
                const newUrl = new URL(window.location);
                newUrl.searchParams.delete('q');
                newUrl.searchParams.set('id', firstTrackId);
                window.history.replaceState({}, '', newUrl);
                fetchTrackData(firstTrackId);
            } else {
                if (loadingDOM) loadingDOM.innerText = "未能精准匹配到该歌曲的数据。";
            }
        })
        .catch(() => {
            if (loadingDOM) loadingDOM.innerText = "检索匹配失败，请检查网络。";
        });
}


// 9. 异步请求指定 ID 的单曲完备详情、音频特征及相似关联推荐数据
function fetchTrackData(trackId) {
    const recommendationWrapper = document.getElementById('random-tracks-wrapper');
    if (recommendationWrapper) recommendationWrapper.style.display = 'none';

    const loadingDOM = document.getElementById('loading-state');
    const contentDOM = document.getElementById('track-content');

    if(loadingDOM) {
        loadingDOM.style.display = 'block';
        loadingDOM.innerText = "正在分析该歌曲的音频画像与推荐...";
    }
    if(contentDOM) contentDOM.style.display = 'none';

    fetch(`/api/track_detail?id=${trackId}`)
        .then(res => res.json())
        .then(res => {
            if (res.code === 200) {
                if(loadingDOM) loadingDOM.style.display = 'none';
                if(contentDOM) contentDOM.style.display = 'flex';

                renderTrackInfo(res.data);
                renderRadarChart(res.data.features);
                renderSimilarTracks(res.similar);

                loadTrackTrend(res.data.name, res.data.artist);

            } else {
                if(loadingDOM) loadingDOM.innerText = res.msg || "加载失败，该歌曲可能已下架。";
            }
        })
        .catch(() => {
            if(loadingDOM) loadingDOM.innerText = "获取画像失败，请检查服务连接。";
        });
}


// 10. 根据当前单曲收藏状态同步切换收藏按钮的 UI 外观样式
function updateFavoriteBtnUI(favorited) {
    const favoriteBtn = document.getElementById('favoriteBtn');
    if (!favoriteBtn) return;

    if (favorited) {
        favoriteBtn.innerHTML = '💚 已收藏';
        favoriteBtn.style.borderColor = '#1db954';
        favoriteBtn.style.color = '#1db954';
    } else {
        favoriteBtn.innerHTML = '🤍 收藏这首歌';
        favoriteBtn.style.borderColor = '#fff';
        favoriteBtn.style.color = '#fff';
    }
}


// 11. 渲染单曲的文本信息与封面，并动态绑定及多条件拦截收藏按钮操作事件
function renderTrackInfo(data) {
    document.getElementById('track-cover').src = data.cover_url || 'https://via.placeholder.com/350?text=No+Cover';
    document.getElementById('track-name').innerText = data.name;

    let artistStr = data.artist;
    if (typeof artistStr === 'string' && artistStr.includes("['")) {
        artistStr = artistStr.replace(/\['/g, '').replace(/'\]/g, '').replace(/', '/g, ', ');
    }
    document.getElementById('track-artist').innerText = artistStr;

    document.getElementById('track-album').innerText = data.album || '未知专辑';
    document.getElementById('track-date').innerText = data.release_date || '未知';
    document.getElementById('track-popularity').innerText = data.popularity + " / 100";

    const spotifyLinkBtn = document.getElementById('spotify-link');
    if (data.id && spotifyLinkBtn) {
        spotifyLinkBtn.href = `https://open.spotify.com/track/${data.id}`;
        spotifyLinkBtn.style.display = 'inline-block';
    } else if (spotifyLinkBtn) {
        spotifyLinkBtn.style.display = 'none';
    }

    const favoriteBtn = document.getElementById('favoriteBtn');
    if (favoriteBtn) {
        favoriteBtn.style.display = 'inline-block';
        let isFavorited = data.is_favorited || false;
        updateFavoriteBtnUI(isFavorited);

        favoriteBtn.onclick = async function() {
            try {
                const favResponse = await fetch('/api/toggle_favorite_track', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ track_id: data.id, track_name: data.name })
                });
                const favResult = await favResponse.json();

                if (favResult.code === 401) {
                    alert("请先登录才能收藏单曲！");
                    window.location.href = '/login';
                    return;
                }

                if (favResult.code === 200) {
                    isFavorited = (favResult.data.status === 'added');
                    updateFavoriteBtnUI(isFavorited);
                } else {
                    alert(favResult.msg);
                }
            } catch (e) {
                console.error("收藏请求失败", e);
            }
        };
    }
}


// 12. 异步拉取特定单曲的历史排名记录并使用 ECharts 渲染打榜趋势折线图
async function loadTrackTrend(trackName, artistName) {
    const container = document.getElementById('trackTrendContainer');
    if (!container) return;
    container.style.display = 'none';

    try {
        let cleanArtist = artistName;
        if (typeof cleanArtist === 'string' && cleanArtist.includes("['")) {
            cleanArtist = cleanArtist.replace(/\['/g, '').replace(/'\]/g, '').replace(/', '/g, ', ');
        }
        const primaryArtist = cleanArtist.split(',')[0].trim();

        const response = await fetch(`/api/track_trend?name=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(primaryArtist)}`);
        const result = await response.json();

        if (result.code === 200 && result.data && result.data.length > 1) {
            container.style.display = 'block';
            const chartDom = document.getElementById('trackTrendChart');
            if (!trackTrendInstance) trackTrendInstance = echarts.init(chartDom);

            const dates = result.data.map(item => item.date);
            const ranks = result.data.map(item => item.rank);

            trackTrendInstance.setOption({
                tooltip: {
                    trigger: 'axis',
                    formatter: '{b} <br/>最高排名: <b>No.{c}</b>',
                    backgroundColor: 'rgba(36,36,38,0.9)',
                    textStyle: { color: '#fff', fontSize: 13 },
                    padding: [8, 12]
                },
                grid: { left: 15, right: 15, top: 30, bottom: 25 },
                xAxis: {
                    type: 'category',
                    data: dates,
                    show: true,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { color: '#666', fontSize: 11, margin: 10 }
                },
                yAxis: {
                    type: 'value',
                    inverse: true,
                    show: false,
                    min: 1
                },
                series: [{
                    data: ranks,
                    type: 'line',
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    showSymbol: true,
                    label: {
                        show: true,
                        position: 'top',
                        formatter: 'No.{c}',
                        color: '#1ed760',
                        fontSize: 12,
                        fontWeight: 'bold',
                        distance: 6
                    },
                    lineStyle: {
                        color: '#1ed760',
                        width: 3,
                        shadowColor: 'rgba(30, 215, 96, 0.5)',
                        shadowBlur: 10
                    },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(30, 215, 96, 0.5)' },
                            { offset: 1, color: 'rgba(30, 215, 96, 0)' }
                        ])
                    }
                }]
            });

            setTimeout(() => trackTrendInstance.resize(), 100);
        }
    } catch (e) {
        console.error("加载排名趋势失败", e);
    }
}


// 13. 渲染单曲叶子节点的相似特征推荐链接列表视图
function renderSimilarTracks(similarList) {
    const listEl = document.getElementById('similar-tracks-list');
    if (!listEl) return;

    if (!similarList || similarList.length === 0) {
        listEl.innerHTML = '<p style="color:#666; text-align:center;">暂无更多相似音频推荐</p>';
        return;
    }

    listEl.innerHTML = similarList.map(track => {
        let artist = track.artist || '未知艺人';
        if (typeof artist === 'string' && artist.includes("['")) {
            artist = artist.replace(/\['/g, '').replace(/'\]/g, '').replace(/', '/g, ', ');
        }

        return `
            <li>
                <a href="/track?id=${track.id}" class="similar-link" onclick="handleSimilarClick(event, '${track.id}')">
                    ${track.name} <span class="similar-artist">- ${artist}</span>
                </a>
                <span class="genre-tag" style="max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${track.album ? '专辑' : '单曲'}
                </span>
            </li>
        `;
    }).join('');
}


// 14. 使用 ECharts 渲染该单曲的五维多维多边形音频特征雷达图画像
function renderRadarChart(features) {
    const chartDom = document.getElementById('features-radar');
    if (!chartDom) return;

    if (!radarChartInstance) radarChartInstance = echarts.init(chartDom);

    const option = {
        tooltip: { trigger: 'item', backgroundColor: '#333', textStyle: {color: '#fff'} },
        radar: {
            indicator: [
                { name: '能量 (Energy)', max: 100 },
                { name: '舞动性 (Dance)', max: 100 },
                { name: '积极度 (Valence)', max: 100 },
                { name: '原声性 (Acoustic)', max: 100 },
                { name: '现场感 (Liveness)', max: 100 }
            ],
            shape: 'circle',
            splitNumber: 4,
            axisName: { color: '#b3b3b3', fontSize: 12 },
            splitLine: { lineStyle: { color: ['#333'] } },
            splitArea: { areaStyle: { color: ['#181818', '#1c1c1c', '#222222', '#2a2a2a'].reverse() } }
        },
        series: [{
            name: '音频特征',
            type: 'radar',
            data: [{
                value: [
                    ((features.energy || 0) * 100).toFixed(1),
                    ((features.danceability || 0) * 100).toFixed(1),
                    ((features.valence || 0) * 100).toFixed(1),
                    ((features.acousticness || 0) * 100).toFixed(1),
                    ((features.liveness || 0) * 100).toFixed(1)
                ],
                name: '本曲特征',
                itemStyle: { color: '#1db954' },
                areaStyle: { color: 'rgba(29, 185, 84, 0.4)' },
                symbol: 'none'
            }]
        }]
    };

    radarChartInstance.setOption(option, true);
}


// 15. 接管相似单曲点击默认事件，就地无缝重组加载新数据以防刷新页面
window.handleSimilarClick = function(event, trackId) {
    event.preventDefault();

    const newUrl = new URL(window.location);
    newUrl.searchParams.set('id', trackId);
    window.history.pushState({}, '', newUrl);

    fetchTrackData(trackId);
};


// 16. 监听窗口大小缩放事件对特征雷达图与排名趋势折线图实例执行界面重绘
window.addEventListener('resize', () => {
    if(radarChartInstance) radarChartInstance.resize();
    if(trackTrendInstance) trackTrendInstance.resize();
});


// 17. 异步拉取随机打榜单曲集合并以微型徽章标签的形式填充至侧边区域
async function loadRandomTracks() {
    const container = document.getElementById('random-tracks-container');
    if (!container) return;

    try {
        const response = await fetch('/api/random_leaderboard_tracks');
        const res = await response.json();

        if (res.code === 200 && res.data.length > 0) {
            container.innerHTML = res.data.map(track => {
                const queryStr = `${track.title} ${track.artist}`;
                const cover = track.cover_url || 'https://via.placeholder.com/26';

                return `
                    <div class="random-track-tag" onclick="handleRandomTrackClick('${queryStr.replace(/'/g, "\\'")}')">
                        <img src="${cover}" alt="cover" onerror="this.src='https://via.placeholder.com/26'">
                        <span title="${track.title} - ${track.artist}">${track.title} - ${track.artist}</span>
                    </div>
                `;
            }).join('');
        } else {
            const wrapper = document.getElementById('random-tracks-wrapper');
            if (wrapper) wrapper.style.display = 'none';
        }
    } catch (e) {
        console.error("加载推荐歌曲失败", e);
        container.innerHTML = `<span style="color:#666; font-size:13px;">加载推荐失败，请检查网络</span>`;
    }
}


// 18. 点击随机打榜推荐单曲时，将其复制到主输入框并直接触发搜索流
window.handleRandomTrackClick = function(query) {
    if (searchInputBox) searchInputBox.value = query;
    if (suggestionsBox) suggestionsBox.style.display = 'none';
    autoSearchAndLoad(query);
};