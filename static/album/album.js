let radarChartInst = null;
let barChartInst = null;
let audioRadarOverviewInst = null;
let isSearching = false;
let debounceTimer;
let averageRadarData = [50, 50, 50, 50, 50];

const PAGE_TYPE = 'album';
const searchInputBox = document.getElementById('searchInput');
const suggestionsBox = document.getElementById('searchSuggestions');


// 1. 页面加载初始化，解析URL参数触发搜索或展示大盘总览
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const queryName = urlParams.get('q');
    const exactId = urlParams.get('id');

    if (queryName) {
        if (searchInputBox) {
            searchInputBox.value = queryName;
        }
        performSearch(exactId);
    } else {
        loadAlbumPageOverview();
    }
});


// 2. 异步获取并加载馆藏专辑的综合平均数据与热门专辑大盘
async function loadAlbumPageOverview() {
    try {
        const response = await fetch('/api/album_page_overview');
        const res = await response.json();
        if (res.code === 200) {
            if (res.data.radar) averageRadarData = res.data.radar;
            renderTop10Albums(res.data.albums);
            renderAudioRadarOverview(averageRadarData, '馆藏专辑综合平均画像', '#1ed760');
        } else {
            document.getElementById('top10AlbumsContainer').innerHTML = `
                <div style="color:#1ed760; padding:20px; text-align:center;">${res.msg}</div>
            `;
        }
    } catch (e) {
        console.error("加载专辑大盘失败:", e);
        document.getElementById('top10AlbumsContainer').innerHTML = `
            <div style="color:red; padding:20px; text-align:center;">服务连接失败，请检查后端运行状态</div>
        `;
    }
}


// 3. 渲染热门专辑列表视图并绑定交互属性
function renderTop10Albums(albums) {
    const albumContainer = document.getElementById('top10AlbumsContainer');
    if (!albumContainer) return;

    if (!albums || albums.length === 0) {
        albumContainer.innerHTML = '<div style="color:#888; padding:20px;">暂无专辑数据</div>';
        return;
    }

    albumContainer.innerHTML = albums.map((album, index) => {
        const coverSrc = album.cover_url || '/static/images/default_album.png';
        const feats = JSON.stringify([
            album.danceability || 0, album.energy || 0, album.valence || 0,
            album.acousticness || 0, album.liveness || 0
        ]);

        return `
            <div class="overview-album-item" 
                 onmouseenter="handleAlbumHover(this)" 
                 onmouseleave="handleAlbumLeave()"
                 onclick="handleAlbumClick('${album.name}')"
                 data-name='${album.name.replace(/'/g, "\\'")}'
                 data-feats='${feats}'>
                <div class="album-cover-preview">
                    <img src="${coverSrc}" alt="${album.name}" onerror="this.src='/static/images/default_album.png'; this.style.opacity='0.5';">
                </div>
                <div class="overview-album-info">
                    <h4 title="${album.name}">${album.name.length > 25 ? album.name.substring(0, 25) + '...' : album.name}</h4>
                    <span>🎤 ${album.artist} | 🏷️ ${album.popularity || 'Discovery'}</span>
                </div>
                <div class="overview-album-rank">#${index + 1}</div>
            </div>
        `;
    }).join('');
}


// 4. 鼠标悬停热门专辑时切换展示该专辑的专属音频特征画像
function handleAlbumHover(element) {
    const feats = JSON.parse(element.getAttribute('data-feats'));
    const name = element.getAttribute('data-name');
    renderAudioRadarOverview(feats, `专属画像: ${name}`, '#1ed760');
}


// 5. 鼠标离开热门专辑时还原展示馆藏综合平均音频画像
function handleAlbumLeave() {
    renderAudioRadarOverview(averageRadarData, '馆藏专辑综合平均画像', '#1ed760');
}


// 6. 点击热门专辑时将其名称填入搜索框并触发主搜索
function handleAlbumClick(name) {
    if (searchInputBox) {
        searchInputBox.value = name;
        suggestionsBox.style.display = 'none';
        performSearch();
    }
}


// 7. 使用ECharts渲染雷达图展示指定的音频特征画像数据
function renderAudioRadarOverview(radarValues, titleText, colorCode) {
    const chartDom = document.getElementById('audioRadarChartOverview');
    if (!chartDom) return;
    if (!audioRadarOverviewInst) audioRadarOverviewInst = echarts.init(chartDom);

    const option = {
        title: { text: titleText, left: 'center', top: 10, textStyle: { color: colorCode, fontSize: 14, fontWeight: 'normal' } },
        tooltip: { trigger: 'item' },
        radar: {
            indicator: [
                { name: '活力 (Energy)', max: 100 }, { name: '舞动 (Dance)', max: 100 },
                { name: '愉悦 (Valence)', max: 100 }, { name: '原声 (Acoustic)', max: 100 },
                { name: '现场 (Liveness)', max: 100 }
            ],
            shape: 'polygon', splitNumber: 4,
            axisName: { color: '#888', fontWeight: 'bold' },
            splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.05)'] } },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
        },
        series: [{
            name: '综合画像', type: 'radar',
            data: [{
                value: radarValues, name: titleText,
                itemStyle: { color: colorCode },
                areaStyle: { color: colorCode, opacity: colorCode === '#888' ? 0.2 : 0.4 },
                lineStyle: { width: 2, color: colorCode }
            }],
            animationDuration: 300
        }]
    };
    audioRadarOverviewInst.setOption(option);
}


// 8. 绑定搜索框的输入联想防抖与聚焦展示历史记录事件
if(searchInputBox){
    searchInputBox.addEventListener('focus', function() {
        if (!this.value.trim()) fetchSearchHistory();
    });

    searchInputBox.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        const query = this.value.trim();
        if (!query) {
            fetchSearchHistory();
            return;
        }
        debounceTimer = setTimeout(() => { fetchAlbumSuggestions(query); }, 300);
    });
}


// 9. 处理搜索框的回车键键入事件以触发搜索
function handleKeyPress(e) {
    if (e.key === 'Enter') {
        suggestionsBox.style.display = 'none';
        performSearch();
    }
}


// 10. 全局点击判定，若点击非搜索区域则隐藏联想下拉框
document.addEventListener('click', (e) => {
    if (!suggestionsBox.contains(e.target) && e.target !== searchInputBox) {
        suggestionsBox.style.display = 'none';
    }
});


// 11. 异步获取当前登录用户的专辑搜索历史记录
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


// 12. 渲染用户的搜索历史记录菜单列表UI
function renderHistoryUI(historyList) {
    suggestionsBox.innerHTML = `
        <div style="padding: 12px 15px; color: #888; font-size: 13px; display: flex; justify-content: space-between; border-bottom: 1px solid #333;">
            <span>🕒 最近搜索</span>
            <span style="cursor:pointer; color:#1db954; font-weight:bold;" onclick="clearSearchHistory()">清空</span>
        </div>
    `;
    historyList.forEach(item => {
        suggestionsBox.innerHTML += `
            <div class="suggestion-item" onclick="triggerHistorySearch('${item.keyword.replace(/'/g, "\\'")}')">
                <span style="font-size: 16px; margin-right: 10px; color: #888;">🕒</span>
                <span style="color: #eee;">${item.keyword}</span>
            </div>
        `;
    });
    suggestionsBox.style.display = 'block';
}


// 13. 异步请求清空当前用户的专辑搜索历史记录
async function clearSearchHistory() {
    try {
        await fetch('/api/clear_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: PAGE_TYPE })
        });
        suggestionsBox.style.display = 'none';
    } catch(e) {}
}


// 14. 点击历史记录单项时填充输入框并直接触发搜索
function triggerHistorySearch(keyword) {
    searchInputBox.value = keyword;
    suggestionsBox.style.display = 'none';
    performSearch();
}


// 15. 异步拉取输入框关键字对应的在线专辑建议联想列表
async function fetchAlbumSuggestions(query) {
    try {
        const response = await fetch(`/api/suggest_album?q=${encodeURIComponent(query)}`);
        const result = await response.json();
        if (result.code === 200 && result.data.length > 0) {
            suggestionsBox.innerHTML = result.data.map(item => `
                <div class="suggestion-item" onclick="searchInputBox.value='${item.name.replace(/'/g, "\\'")}'; suggestionsBox.style.display='none'; performSearch('${item.id}')">
                    <img src="${item.cover_url || ''}" style="width:35px; height:35px; border-radius:4px; object-fit:cover; background:#444; margin-right: 12px;" onerror="this.src='/static/images/default_album.png'">
                    <div style="overflow:hidden;">
                        <div style="font-size:14px; color:#fff; white-space:nowrap; text-overflow:ellipsis;">${item.name}</div>
                        <div style="font-size:12px; color:#888;">${item.artist}</div>
                    </div>
                </div>
            `).join('');
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    } catch (e) { console.error("联想失败", e); }
}


// 16. 根据当前专辑收藏状态同步切换收藏按钮的UI外观样式
function updateFavoriteBtnUI(favorited) {
    const favoriteBtn = document.getElementById('favoriteBtn');
    if (!favoriteBtn) return;

    if (favorited) {
        favoriteBtn.innerHTML = '💚 已收藏';
        favoriteBtn.style.borderColor = '#1db954';
        favoriteBtn.style.color = '#1db954';
    } else {
        favoriteBtn.innerHTML = '🤍 收藏';
        favoriteBtn.style.borderColor = '#fff';
        favoriteBtn.style.color = '#fff';
    }
}


// 17. 执行专辑主搜索核心请求逻辑，拉取数据并动态绑定收藏按钮事件
async function performSearch(exactId = null) {
    if (isSearching) return;
    const query = searchInputBox.value.trim();
    if (!query && !exactId) { alert("请输入专辑名称！"); return; }

    isSearching = true;
    suggestionsBox.style.display = 'none';

    const overview = document.getElementById('albumOverviewWrapper');
    if (overview) overview.style.display = 'none';

    const albumContent = document.getElementById('albumContent');
    const loader = document.getElementById('loader');

    if (albumContent) albumContent.style.display = 'none';
    if (loader) loader.style.display = 'block';

    try {
        let requestUrl = `/api/search_album?q=${encodeURIComponent(query)}`;
        if (exactId && typeof exactId === 'string') requestUrl += `&id=${exactId}`;

        const response = await fetch(requestUrl);
        const result = await response.json();

        if (result.code === 200) {
            renderMainAlbum(result.data);

            const favoriteBtn = document.getElementById('favoriteBtn');
            if (favoriteBtn) {
                favoriteBtn.style.display = 'inline-block';
                let isFavorited = result.data.is_favorited || false;
                updateFavoriteBtnUI(isFavorited);

                favoriteBtn.onclick = async function() {
                    try {
                        const favResponse = await fetch('/api/toggle_favorite_album', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ album_id: result.data.id, album_name: result.data.name })
                        });
                        const favResult = await favResponse.json();

                        if (favResult.code === 401) {
                            alert("请先登录才能收藏专辑！");
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

        } else {
            alert(result.msg || "未找到相关专辑数据");
            if (overview) overview.style.display = 'block';
        }
    } catch (error) {
        console.error("搜索异常:", error);
        alert("请求服务失败，请重试");
    } finally {
        if (loader) loader.style.display = 'none';
        isSearching = false;
    }
}


// 18. 渲染专辑搜索结果页面的基本文本与封面核心信息
function renderMainAlbum(data) {
    const content = document.getElementById('albumContent');
    if (!content) return;
    content.style.display = 'block';

    document.getElementById('albumName').innerText = data.name;
    document.getElementById('artistName').innerText = data.artist;
    document.getElementById('releaseDate').innerText = data.release_date;
    document.getElementById('totalTracks').innerText = `${data.total_tracks} 首`;
    document.getElementById('albumTotalPlays').innerText = data.total_playcount.toLocaleString();

    if (data.image_url) {
        const coverDiv = document.getElementById('albumCover');
        if (coverDiv) coverDiv.style.backgroundImage = `url('${data.image_url}')`;
    }

    renderTrackList(data.tracks);
    renderSimilarAlbums(data.similar_albums);
    renderCharts(data);
}


// 19. 渲染专辑内的曲目单单曲列表并生成对应的跳转搜索链接
function renderTrackList(tracks) {
    const listEl = document.getElementById('trackList');
    if (!listEl) return;
    const artistName = document.getElementById('artistName').innerText;

    listEl.innerHTML = tracks.map(track => {
        const searchQuery = encodeURIComponent(track.name + ' ' + artistName);
        return `
        <div class="track-row" onclick="window.location.href='/track?q=${searchQuery}'" style="cursor:pointer;">
            <div class="col-num" style="width:40px; text-align:center;">${track.track_number}</div>
            <div class="col-title" style="flex:1;">${track.name}</div>
            <div class="col-pop" style="width:120px;">${track.play_count.toLocaleString()}</div>
            <div class="col-dur" style="width:60px; text-align:right;">${track.duration}</div>
        </div>
        `;
    }).join('');
}


// 20. 渲染相似风格或衍生推荐的专辑建议列表视图
function renderSimilarAlbums(albums) {
    const listEl = document.getElementById('similarAlbumsList');
    if (!listEl) return;
    if (!albums || albums.length === 0) {
        listEl.innerHTML = '<div style="color:#888; text-align:center; padding:20px;">暂无相似推荐</div>';
        return;
    }

    listEl.innerHTML = albums.map(album => `
        <div class="suggestion-item" onclick="handleAlbumClick('${album.name.replace(/'/g, "\\'")}')" style="display:flex; align-items:center; gap:10px; padding:10px; cursor:pointer;">
            <img src="${album.cover_url || ''}" style="width:45px; height:45px; border-radius:4px; object-fit: cover; background:#444;" onerror="this.src='/static/images/default_album.png'">
            <div style="overflow:hidden;">
                <div style="color: #fff; font-size: 14px; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${album.name}</div>
                <div style="color: #888; font-size: 12px; margin-top: 4px;">${album.artist}</div>
            </div>
        </div>
    `).join('');
}


// 21. 使用ECharts图表组件渲染专辑维度的特征雷达图与单曲热度柱状图
function renderCharts(data) {
    const radarDom = document.getElementById('radarChart');
    const barDom = document.getElementById('barChart');

    if (radarDom) {
        if (!radarChartInst) radarChartInst = echarts.init(radarDom);
        radarChartInst.setOption({
            tooltip: { show: true, backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' } },
            radar: {
                indicator: [
                    { name: '活力', max: 100 }, { name: '舞动', max: 100 },
                    { name: '积极', max: 100 }, { name: '原声', max: 100 }, { name: '现场', max: 100 }
                ],
                shape: 'circle',
                axisName: { color: '#888' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
            },
            series: [{
                type: 'radar',
                data: [{
                    value: [
                        data.features.energy || 0,
                        data.features.danceability || 0,
                        data.features.valence || 0,
                        data.features.acousticness || 0,
                        data.features.liveness || 0
                    ],
                    itemStyle: { color: '#1db954' },
                    areaStyle: { color: 'rgba(29, 185, 84, 0.3)' }
                }]
            }]
        }, true);
    }

    if (barDom) {
        if (!barChartInst) barChartInst = echarts.init(barDom);
        const trackNames = data.tracks.map(t => t.name.length > 8 ? t.name.substring(0, 8) + '...' : t.name);
        barChartInst.setOption({
            tooltip: { trigger: 'axis', backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' } },
            xAxis: { type: 'category', data: trackNames, axisLabel: { color: '#666', rotate: 35 } },
            yAxis: { type: 'value', splitLine: { show: false }, axisLabel: { show: false } },
            grid: { top: '10%', bottom: '20%', left: '5%', right: '5%' },
            series: [{
                data: data.tracks.map(t => t.play_count),
                type: 'bar',
                itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: '#1db954'}, {offset: 1, color: 'transparent'}]) }
            }]
        }, true);
    }
}


// 22. 监听浏览器窗口尺寸改变事件以自适应动态重绘所有ECharts图表实例
window.addEventListener('resize', () => {
    if (radarChartInst) radarChartInst.resize();
    if (barChartInst) barChartInst.resize();
    if (audioRadarOverviewInst) audioRadarOverviewInst.resize();
});