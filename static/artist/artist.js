let trendChartInst = null;
let wordCloudInst = null;
let similarGraphInst = null;
let genreChartOverviewInst = null;
let miniTrendInst = null;
let debounceTimer;
let isSearching = false;

const PAGE_TYPE = 'artist';
const searchInputBox = document.getElementById('searchInput');
const suggestionsBox = document.getElementById('searchSuggestions');


// 1. 页面加载初始化，解析URL参数触发搜索或展示大盘总览
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const queryName = urlParams.get('q');

    if (queryName) {
        if (searchInputBox) {
            searchInputBox.value = queryName;
            performSearch();
        }
    } else {
        loadArtistOverview();
    }
});


// 2. 异步获取并渲染艺人总览大盘数据
function loadArtistOverview() {
    fetch('/api/artist_page_overview')
        .then(response => response.json())
        .then(res => {
            if (res.code === 200) {
                renderTop10Artists(res.data.artists);
                renderGenreChart(res.data.genres);
            } else {
                document.getElementById('top10ArtistsContainer').innerHTML = `<div style="color:#b3b3b3; padding: 20px;">${res.msg}</div>`;
            }
        })
        .catch(err => {
            console.error("加载大盘失败:", err);
            document.getElementById('top10ArtistsContainer').innerHTML = `<div style="color:red; padding: 20px;">加载大盘失败，请检查网络。</div>`;
        });
}


// 3. 渲染热门前十艺人列表视图
function renderTop10Artists(artists) {
    const container = document.getElementById('top10ArtistsContainer');
    container.innerHTML = '';

    artists.forEach((artist, index) => {
        const artistDiv = document.createElement('div');
        artistDiv.className = 'overview-artist-item';
        artistDiv.onclick = () => {
            searchInputBox.value = artist.name;
            performSearch();
        };

        let avatarHtml = artist.image_url
            ? `<img src="${artist.image_url}" alt="${artist.name}" onerror="this.src='/static/images/default-avatar.png'">`
            : `<div style="width: 45px; height: 45px; border-radius: 50%; background: #444; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; margin-right: 15px;">${artist.name.charAt(0)}</div>`;

        artistDiv.innerHTML = `
            ${avatarHtml}
            <div class="overview-artist-info">
                <h4>${artist.name}</h4>
                <span>🎧${artist.genre}</span>
            </div>
            <div class="overview-artist-rank">#${index + 1}</div>
        `;
        container.appendChild(artistDiv);
    });
}


// 4. 使用 ECharts 渲染大盘流派分布饼图
function renderGenreChart(genreData) {
    const chartDom = document.getElementById('genreChartOverview');
    if (!genreChartOverviewInst) genreChartOverviewInst = echarts.init(chartDom);

    const option = {
        tooltip: { trigger: 'item', backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' }, formatter: '{b} : {c} 位 ({d}%)' },
        legend: { top: 'bottom', textStyle: { color: '#b3b3b3' } },
        series: [{
            name: '流派分布', type: 'pie', radius: ['40%', '70%'], avoidLabelOverlap: false,
            itemStyle: { borderRadius: 10, borderColor: '#282828', borderWidth: 2 },
            label: { show: false, position: 'center' },
            emphasis: { label: { show: true, fontSize: '20', fontWeight: 'bold', color: '#fff' } },
            labelLine: { show: false }, data: genreData
        }]
    };
    genreChartOverviewInst.setOption(option);
}


// 5. 绑定搜索框的输入联想防抖与聚焦展示历史记录事件
if(searchInputBox){
    searchInputBox.addEventListener('focus', function() {
        const query = this.value.trim();
        if (!query) fetchSearchHistory();
    });

    searchInputBox.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        const query = this.value.trim();
        if (!query) {
            fetchSearchHistory();
            return;
        }
        debounceTimer = setTimeout(() => { fetchArtistSuggestions(query); }, 300);
    });
}


// 6. 处理搜索框的回车键键入事件以触发搜索
function handleKeyPress(e) {
    if (e.key === 'Enter') {
        suggestionsBox.style.display = 'none';
        performSearch();
    }
}


// 7. 全局点击判定，若点击非搜索区域则隐藏联想下拉框
document.addEventListener('click', (e) => {
    if (e.target !== searchInputBox && e.target !== suggestionsBox && !suggestionsBox.contains(e.target)) {
        suggestionsBox.style.display = 'none';
    }
});


// 8. 异步获取当前用户的艺人搜索历史记录
async function fetchSearchHistory() {
    try {
        const res = await fetch(`/api/search_history?type=${PAGE_TYPE}`);
        const result = await res.json();
        if (result.code === 200 && result.data.length > 0) {
            renderHistoryUI(result.data);
        } else {
            suggestionsBox.style.display = 'none';
        }
    } catch (e) { console.error(e); }
}


// 9. 渲染用户的搜索历史记录菜单列表 UI
function renderHistoryUI(historyList) {
    suggestionsBox.innerHTML = `
        <div style="padding: 12px 15px; color: #888; font-size: 13px; display: flex; justify-content: space-between; border-bottom: 1px solid #333;">
            <span>🕒 最近搜索</span>
            <span style="cursor:pointer; color:#1db954; transition: 0.2s;" onclick="clearSearchHistory()">清空记录</span>
        </div>
    `;
    historyList.forEach(item => {
        suggestionsBox.innerHTML += `
            <div class="suggestion-item" onclick="triggerHistorySearch('${item.keyword.replace(/'/g, "\\'")}')">
                <span style="font-size: 16px; margin-right: 10px; color: #888;">🕒</span>
                <span>${item.keyword}</span>
            </div>
        `;
    });
    suggestionsBox.style.display = 'block';
}


// 10. 异步请求清空当前用户的艺人搜索历史记录
async function clearSearchHistory() {
    try {
        await fetch('/api/clear_history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: PAGE_TYPE }) });
        suggestionsBox.style.display = 'none';
    } catch(e) {}
}


// 11. 点击历史记录单项时填充输入框并直接触发搜索
function triggerHistorySearch(keyword) {
    searchInputBox.value = keyword;
    suggestionsBox.style.display = 'none';
    performSearch();
}


// 12. 异步拉取输入框关键字对应的在线艺人建议联想列表
async function fetchArtistSuggestions(query) {
    try {
        const response = await fetch(`/api/suggest_artist?q=${encodeURIComponent(query)}`);
        const result = await response.json();
        if (result.code === 200 && result.data.length > 0) {
            renderSuggestionsUI(result.data);
        } else {
            suggestionsBox.style.display = 'none';
        }
    } catch (error) {}
}


// 13. 渲染艺人搜索建议联想下拉列表
function renderSuggestionsUI(items) {
    suggestionsBox.innerHTML = '';
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        let avatarHtml = item.avatar_url ? `<img src="${item.avatar_url}" alt="${item.name}">` : item.name.charAt(0).toUpperCase();
        div.innerHTML = `<div class="suggestion-avatar">${avatarHtml}</div><div class="suggestion-name">${item.name}</div>`;
        div.onclick = () => {
            searchInputBox.value = item.name;
            suggestionsBox.style.display = 'none';
            performSearch(item.id);
        };
        suggestionsBox.appendChild(div);
    });
    suggestionsBox.style.display = 'block';
}


// 14. 根据当前艺人收藏状态同步切换收藏按钮的 UI 外观样式
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


// 15. 执行艺人主搜索核心请求逻辑，拉取数据并动态绑定收藏按钮事件
async function performSearch(exactId = null) {
    if (isSearching) return;

    const query = searchInputBox.value.trim();
    if (!query) { alert("请输入艺人名称！"); return; }

    isSearching = true;
    suggestionsBox.style.display = 'none';

    const overviewWrapper = document.getElementById('artistOverviewWrapper');
    if (overviewWrapper) overviewWrapper.style.display = 'none';

    document.getElementById('artistContent').style.display = 'none';
    document.getElementById('loader').style.display = 'block';

    try {
        let requestUrl = `/api/search_artist?q=${encodeURIComponent(query)}`;
        if (exactId && typeof exactId === 'string') requestUrl += `&id=${exactId}`;

        const response = await fetch(requestUrl);
        const result = await response.json();

        document.getElementById('loader').style.display = 'none';

        if (result.code === 200) {
            const data = result.data;

            document.getElementById('artistContent').style.display = 'flex';
            document.getElementById('artistName').innerText = data.name;
            document.getElementById('listenersCount').innerText = data.listeners;

            const avatarDiv = document.getElementById('artistAvatar');
            if (data.image_url) {
                avatarDiv.innerHTML = `<img src="${data.image_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" alt="${data.name}"/>`;
                avatarDiv.style.background = 'transparent';
            } else {
                avatarDiv.innerHTML = data.name.charAt(0).toUpperCase();
                avatarDiv.style.background = '#444';
            }

            const genreContainer = document.getElementById('genreTags');
            genreContainer.innerHTML = '';
            if (data.genres && data.genres.length > 0) {
                data.genres.forEach(g => genreContainer.innerHTML += `<span class="genre-tag">${g}</span>`);
            } else {
                genreContainer.innerHTML = `<span class="genre-tag">未知流派</span>`;
            }

            renderTopTracks(data.top_tracks);
            renderCharts(data.top_tracks);
            renderWordCloud(data.tags_data);
            renderArtistAlbums(data.albums);
            renderSimilarGraph(data.name, data.image_url, data.similar_artists);

            loadArtistTrend(data.name);

            const favoriteBtn = document.getElementById('favoriteBtn');
            if (favoriteBtn) {
                favoriteBtn.style.display = 'inline-block';
                let isFavorited = data.is_favorited || false;
                updateFavoriteBtnUI(isFavorited);

                favoriteBtn.onclick = async function() {
                    try {
                        const response = await fetch('/api/toggle_favorite', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ artist_name: data.name })
                        });
                        const favResult = await response.json();

                        if (favResult.code === 401) {
                            alert("请先登录才能收藏艺人！");
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
            alert(result.msg || "搜索失败");
        }
    } catch (error) {
        document.getElementById('loader').style.display = 'none';
        alert(`请求遇到问题: ${error.message}`);
    } finally {
        isSearching = false;
    }
}


// 16. 异步获取并渲染该艺人的排名趋势折线图
async function loadArtistTrend(artistName) {
    const wrapper = document.getElementById('artistTrendWrapper');
    if (!wrapper) return;

    wrapper.style.display = 'none';

    try {
        const response = await fetch(`/api/artist_trend?name=${encodeURIComponent(artistName)}`);
        const result = await response.json();

        if (result.code === 200 && result.data && result.data.length > 1) {
            wrapper.style.display = 'flex';

            const chartDom = document.getElementById('artistTrendChartMini');
            if (!miniTrendInst) miniTrendInst = echarts.init(chartDom);

            const dates = result.data.map(item => item.date);
            const ranks = result.data.map(item => item.rank);

            miniTrendInst.setOption({
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

            setTimeout(() => miniTrendInst.resize(), 100);
        }
    } catch (e) {
        console.error("加载排名趋势失败", e);
    }
}


// 17. 渲染该艺人的热门单曲列表
function renderTopTracks(tracks) {
    const listEl = document.getElementById('topTracksList');
    listEl.innerHTML = '';
    const artistName = document.getElementById('artistName').innerText;

    tracks.forEach((track, index) => {
        let coverHtml = track.cover_url
            ? `<img src="${track.cover_url}" style="width:100%; height:100%; border-radius:4px; object-fit: cover;">`
            : `🎵`;
        let duration = track.duration || "--:--";
        const searchQuery = encodeURIComponent(track.name + ' ' + artistName);

        let row = `
        <div class="track-row" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s; cursor: pointer;" 
             onclick="window.location.href='/track?q=${searchQuery}'"
             onmouseover="this.style.background='rgba(255,255,255,0.05)'" 
             onmouseout="this.style.background='transparent'">
            <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                <div class="track-cover" style="width: 40px; height: 40px; flex-shrink: 0;">${coverHtml}</div>
                <div class="track-info-col" style="display: flex; flex-direction: column; justify-content: center;">
                    <div class="track-title" style="color: #eee; font-size: 14px; font-weight: 500; margin-bottom: 4px;">${index + 1}. ${track.name}</div>
                    <div class="track-plays" style="color: #888; font-size: 12px;">${track.album_name}</div>
                </div>
            </div>
            <div style="color: #888; font-size: 13px; font-family: monospace; text-align: right; padding-right: 15px;">
                ${duration}
            </div>
        </div>`;
        listEl.innerHTML += row;
    });
}


// 18. 渲染该艺人的热门专辑展示卡片
function renderArtistAlbums(albums) {
    const container = document.getElementById('artistAlbumsList');
    container.innerHTML = '';

    if (!albums || albums.length === 0) {
        container.innerHTML = '<div style="color:#888; padding: 20px 0;">该艺人暂无专辑数据</div>';
        return;
    }

    const top3Albums = albums.slice(0, 3);
    top3Albums.forEach(album => {
        const coverSrc = album.cover_url || '/static/images/default_album.png';
        const cardHtml = `
            <div class="artist-album-card" onclick="window.location.href='/albums?q=${encodeURIComponent(album.name)}&id=${album.id}'">
                <img src="${coverSrc}" class="artist-album-cover" alt="${album.name}">
                <div class="artist-album-info">
                    <div class="artist-album-name" title="${album.name}">${album.name}</div>
                    <div class="artist-album-meta">
                        <span>${album.release_year}</span>
                        <span style="margin-left: 10px;">${album.type}</span>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}


// 19. 使用 ECharts 渲染该艺人热门单曲播放量柱状图
function renderCharts(tracks) {
    if (!trendChartInst) trendChartInst = echarts.init(document.getElementById('trendChart'));

    const trackNames = tracks.map(t => t.name.length > 12 ? t.name.substring(0, 12) + '...' : t.name);
    const playCounts = tracks.map(t => t.play_count);
    const showEndPercentage = tracks.length > 4 ? (4 / tracks.length) * 100 : 100;

    trendChartInst.setOption({
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' } },
        grid: { left: '5%', right: '5%', bottom: '10%', top: '15%', containLabel: true },
        dataZoom: [{ type: 'inside', xAxisIndex: 0, start: 0, end: showEndPercentage }],
        xAxis: { type: 'category', data: trackNames, axisLabel: { color: '#888', interval: 0, rotate: 20 } },
        yAxis: { type: 'value', axisLabel: { color: '#888', formatter: (value) => value >= 10000 ? (value / 10000).toFixed(0) + ' 万' : value }, splitLine: { lineStyle: { color: '#333', type: 'dashed' } } },
        series: [{
            data: playCounts, type: 'bar', barWidth: '35%',
            itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#1db954' }, { offset: 1, color: 'rgba(29, 185, 84, 0.2)' }]), borderRadius: [4, 4, 0, 0] }
        }]
    }, true);
}


// 20. 使用 ECharts 渲染该艺人的特征标签词云图
function renderWordCloud(tagsData) {
    if (!wordCloudInst) wordCloudInst = echarts.init(document.getElementById('wordCloudChart'));
    if (!tagsData || tagsData.length === 0) {
        document.getElementById('wordCloudChart').innerHTML = '<div style="color:#888; text-align:center; margin-top:20px;">暂无标签数据</div>';
        return;
    }

    const formattedTags = tagsData.map((item, index) => ({ name: item.name, value: 100 - (index * 15) }));

    wordCloudInst.setOption({
        tooltip: { show: true, backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' } },
        series: [{
            type: 'wordCloud', shape: 'circle', keepAspect: false,
            left: 'center', top: 'center', width: '90%', height: '90%',
            sizeRange: [12, 45], rotationRange: [-45, 45], rotationStep: 45, gridSize: 8, drawOutOfBound: false,
            textStyle: {
                fontFamily: 'sans-serif', fontWeight: 'bold',
                color: function () {
                    const colors = ['#1db954', '#1ed760', '#4a6bdc', '#8a9fdf', '#ffffff', '#a8b2d1'];
                    return colors[Math.floor(Math.random() * colors.length)];
                }
            },
            data: formattedTags
        }]
    });
}


// 21. 将图片转换为圆形格式以供知识图谱节点使用
function createCircularImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const size = 150;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2, false);
            ctx.clip();

            const scale = Math.max(size / img.width, size / img.height);
            const x = (size / 2) - (img.width / 2) * scale;
            const y = (size / 2) - (img.height / 2) * scale;
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = function() { resolve(url); };
        img.src = url;
    });
}


// 22. 使用 ECharts 渲染相似艺人的关系知识图谱并动态加载节点头像
function renderSimilarGraph(centerArtistName, centerImageUrl, similarArtists) {
    const chartDom = document.getElementById('similarGraphChart');
    if (!chartDom) return;
    if (!similarGraphInst) similarGraphInst = echarts.init(chartDom);

    if (!similarArtists || similarArtists.length === 0) {
        chartDom.innerHTML = '<div style="color:#888; text-align:center; margin-top:80px;">暂无关系图谱数据</div>';
        return;
    }

    let nodes = [{
        name: centerArtistName, symbolSize: 65, symbol: 'circle',
        itemStyle: { color: '#1db954', borderColor: '#1ed760', borderWidth: 3, shadowBlur: 15, shadowColor: 'rgba(29, 185, 84, 0.8)' },
        label: { show: true, position: 'bottom', fontSize: 14, fontWeight: 'bold', color: '#fff', textBorderColor: '#181818', textBorderWidth: 3 },
        category: 0
    }];

    let links = [];
    const colors = ['#658af0', '#b258e6', '#e658a8', '#f0a865', '#4dc7d9'];

    similarArtists.forEach((artist, index) => {
        const size = 45 - (index * 4);
        nodes.push({
            name: artist.name, symbolSize: size, symbol: 'circle',
            itemStyle: { color: colors[index % colors.length], borderColor: '#fff', borderWidth: 2 },
            label: { show: true, position: 'bottom', fontSize: 12, color: '#ddd', textBorderColor: '#181818', textBorderWidth: 2 },
            category: 1
        });
        links.push({ source: centerArtistName, target: artist.name, lineStyle: { width: 3 - (index * 0.3), curveness: 0.2 } });
    });

    const option = {
        tooltip: { formatter: '{b}' },
        animationDurationUpdate: 1000, animationEasingUpdate: 'quinticInOut',
        series: [{
            type: 'graph', layout: 'force',
            force: { repulsion: 400, edgeLength: 100, gravity: 0.1 },
            roam: true, draggable: true, label: { position: 'bottom' },
            lineStyle: { color: 'source', curveness: 0.3, opacity: 0.6 },
            emphasis: { focus: 'adjacency', lineStyle: { width: 5, opacity: 1 } },
            data: nodes, links: links
        }]
    };
    similarGraphInst.setOption(option, true);

    if (centerImageUrl) {
        createCircularImage(centerImageUrl).then(circularUrl => {
            nodes[0].symbol = `image://${circularUrl}`;
            similarGraphInst.setOption({ series: [{ data: nodes }] });
        });
    }

    similarArtists.forEach((artist, index) => {
        fetch(`/api/get_artist_image?name=${encodeURIComponent(artist.name)}`)
            .then(res => res.json())
            .then(result => {
                if (result.code === 200 && result.data.image_url) {
                    createCircularImage(result.data.image_url).then(circularUrl => {
                        nodes[index + 1].symbol = `image://${circularUrl}`;
                        nodes[index + 1].itemStyle = { borderColor: '#fff', borderWidth: 2 };
                        similarGraphInst.setOption({ series: [{ data: nodes }] });
                    });
                }
            })
            .catch(err => console.log("加载头像节点失败", err));
    });

    similarGraphInst.off('click');
    similarGraphInst.on('click', function (params) {
        if (params.dataType === 'node' && params.data.name !== centerArtistName) {
            searchInputBox.value = params.data.name;
            performSearch();
        }
    });
}


// 23. 监听浏览器窗口尺寸改变事件以自适应动态重绘所有 ECharts 图表实例
window.addEventListener('resize', () => {
    if(trendChartInst) trendChartInst.resize();
    if(wordCloudInst) wordCloudInst.resize();
    if(similarGraphInst) similarGraphInst.resize();
    if(genreChartOverviewInst) genreChartOverviewInst.resize();
    if(miniTrendInst) miniTrendInst.resize();
});