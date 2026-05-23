let timeChartInst = null;
let genreChartInst = null;
let radarChartInst = null;
let scatterChartInst = null;
let miniRadarInsts = [];
let isSearching = false;

let globalGenreData = [];
let globalRadarData = [];
let currentTimeTasteMap = {};

const PAGE_TYPE = 'user';
const searchInputBox = document.getElementById('searchInput');
const suggestionsBox = document.getElementById('searchSuggestions');


// 1. 页面加载初始化，解析URL参数触发音乐画像搜索
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const queryName = urlParams.get('username') || urlParams.get('q');
    if (queryName) {
        if (searchInputBox) searchInputBox.value = queryName;
        performSearch();
    }
});


// 2. 绑定搜索框聚焦与输入事件，动态触发历史记录展示或菜单隐藏
if (searchInputBox) {
    searchInputBox.addEventListener('focus', function() { if (!this.value.trim()) fetchSearchHistory(); });
    searchInputBox.addEventListener('input', function() {
        if (!this.value.trim()) fetchSearchHistory();
        else if (suggestionsBox) suggestionsBox.style.display = 'none';
    });
}


// 3. 全局点击判定，若点击非搜索区域则隐藏联想下拉框
document.addEventListener('click', (e) => {
    if (suggestionsBox && !suggestionsBox.contains(e.target) && e.target !== searchInputBox) suggestionsBox.style.display = 'none';
});


// 4. 处理搜索框的回车键键入事件以触发搜索
function handleKeyPress(e) {
    if (e.key === 'Enter') {
        if (suggestionsBox) suggestionsBox.style.display = 'none';
        performSearch();
    }
}


// 5. 异步获取当前登录用户的用户搜索历史记录
async function fetchSearchHistory() {
    if (!suggestionsBox) return;
    try {
        const res = await (await fetch(`/api/search_history?type=${PAGE_TYPE}`)).json();
        if (res.code === 200 && res.data.length > 0) renderHistoryUI(res.data);
        else suggestionsBox.style.display = 'none';
    } catch (e) { console.error("加载历史记录失败", e); }
}


// 6. 渲染用户的听歌画像搜索历史菜单项列表 UI
function renderHistoryUI(historyList) {
    suggestionsBox.innerHTML = `
        <div style="padding: 12px 15px; color: #888; font-size: 13px; display: flex; justify-content: space-between; border-bottom: 1px solid #333;">
            <span>🕒 最近查询</span>
            <span style="cursor:pointer; color:#1db954;" onclick="clearSearchHistory()">清空</span>
        </div>
    `;
    historyList.forEach(item => {
        suggestionsBox.innerHTML += `
            <div class="suggestion-item" onclick="triggerHistorySearch('${item.keyword}')" style="display:flex; align-items:center; padding:12px 15px; cursor:pointer; border-bottom: 1px solid #333;">
                <span style="font-size:16px; margin-right:10px; color:#888;">👤</span>
                <span style="color:#eee; font-size:14px;">${item.keyword}</span>
            </div>
        `;
    });
    suggestionsBox.style.display = 'block';
}


// 7. 异步请求清空当前用户的用户画像搜索历史记录
async function clearSearchHistory() {
    try {
        await fetch('/api/clear_history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: PAGE_TYPE }) });
        if (suggestionsBox) suggestionsBox.style.display = 'none';
    } catch(e) {}
}


// 8. 点击历史记录单项时填充输入框并直接触发搜索流
function triggerHistorySearch(keyword) {
    if (searchInputBox) searchInputBox.value = keyword;
    if (suggestionsBox) suggestionsBox.style.display = 'none';
    performSearch();
}


// 9. 执行音乐画像主搜索核心请求逻辑，解析听歌时段与特征偏好数据
async function performSearch() {
    if (isSearching) return;
    const query = searchInputBox ? searchInputBox.value.trim() : '';
    if (!query) return;

    isSearching = true;
    if (suggestionsBox) suggestionsBox.style.display = 'none';

    const previewWrapper = document.getElementById('featuresPreviewWrapper');
    if (previewWrapper) previewWrapper.style.display = 'none';

    document.getElementById('userContent').style.display = 'none';
    document.getElementById('loader').style.display = 'block';
    document.getElementById('loader').innerText = `🔍 正在提取 ${query} 的听歌偏好...`;

    try {
        const response = await fetch(`/api/user_taste?username=${encodeURIComponent(query)}`);
        const result = await response.json();

        if (result.code !== 200) {
            alert(result.msg);
            document.getElementById('loader').style.display = 'none';
            if (previewWrapper) previewWrapper.style.display = 'block';
            isSearching = false; return;
        }

        const data = result.data;
        document.getElementById('userName').innerText = data.username;

        const avatarDiv = document.getElementById('userAvatar');
        if (data.avatar_url) avatarDiv.innerHTML = `<img src="${data.avatar_url}" style="width:100%; height:100%; object-fit:cover;"/>`;
        else avatarDiv.innerText = data.username.charAt(0).toUpperCase();

        document.getElementById('playlistCount').innerHTML = `分析了 <b>${data.matched_tracks_count}</b> 首曲目`;
        renderTopArtists(data.top_artists);
        renderRecentTracks(data.recent_tracks);

        document.getElementById('loader').style.display = 'none';
        document.getElementById('userContent').style.display = 'flex';

        renderCharts(data.genre_data, data.radar_data, data.time_period_data, data.time_taste_map);
        renderClusterAnalysis(data.clusters_info, data.scatter_data);

        setTimeout(() => {
            timeChartInst && timeChartInst.resize();
            genreChartInst && genreChartInst.resize();
            radarChartInst && radarChartInst.resize();
            scatterChartInst && scatterChartInst.resize();
            miniRadarInsts.forEach(i => i.resize());
        }, 100);

    } catch (error) {
        alert("请求失败，请稍后重试");
        document.getElementById('loader').style.display = 'none';
        const previewWrapper = document.getElementById('featuresPreviewWrapper');
        if (previewWrapper) previewWrapper.style.display = 'block';
    } finally {
        isSearching = false;
    }
}


// 10. 渲染用户最常聆听的顶级艺人标签列表
function renderTopArtists(artists) {
    document.querySelector('.top-artists').innerHTML = artists ? artists.map(a => `<div class="artist-tag">🎵 ${a.name} (${a.playcount})</div>`).join('') : '';
}


// 11. 渲染用户近期聆听的歌曲明细列表并生成对应的搜索流跳转
function renderRecentTracks(tracks) {
    const container = document.getElementById('topTracksContainer');
    if (!tracks || tracks.length === 0) {
        container.innerHTML = '<div style="color:#666; text-align:center; padding:40px;">暂无最近听歌数据</div>';
        return;
    }
    container.innerHTML = tracks.map(track => {
        const timeTag = track.played_at === "正在播放"
            ? `<span style="color:#1db954; font-weight:bold;">🎧 Now</span>`
            : `<span style="color:#666; font-size:11px;">${track.played_at}</span>`;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; background:rgba(255,255,255,0.03); border-radius:8px; margin-bottom:5px; cursor: pointer; transition: 0.2s;"
                 onclick="window.location.href='/track?q=${encodeURIComponent(track.name + ' ' + track.artist)}'"
                 onmouseover="this.style.background='rgba(255,255,255,0.08)'"
                 onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                <div style="overflow:hidden; padding-right:15px;">
                    <div style="color:#fff; font-size:15px; font-weight:bold; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${track.name}</div>
                    <div style="color:#b3b3b3; font-size:13px; margin-top:4px;">${track.artist}</div>
                </div>
                <div style="flex-shrink:0;">${timeTag}</div>
            </div>`;
    }).join('');
}


// 12. 使用 ECharts 渲染听歌时段饼图，并绑定鼠标悬停时联动更新流派与雷达图画像的交互事件
function renderCharts(genreData, radarData, timeData, tasteMap) {
    globalGenreData = genreData;
    globalRadarData = radarData;
    currentTimeTasteMap = tasteMap || {};

    if (!timeChartInst) timeChartInst = echarts.init(document.getElementById('timeChart'));
    timeChartInst.setOption({
        tooltip: { trigger: 'item', backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' } },
        legend: { top: '0%', left: 'center', textStyle: { color: '#b3b3b3' } },
        color: ['#f1c40f', '#e67e22', '#9b59b6', '#3498db'],
        series: [{
            name: '收听频次', type: 'pie', radius: ['45%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: { borderRadius: 6, borderColor: '#242424', borderWidth: 2 },
            label: { show: false, position: 'center' },
            emphasis: { label: { show: true, fontSize: 18, fontWeight: 'bold', color: '#fff', formatter: '{b}\n{c} 首' } },
            labelLine: { show: false },
            data: timeData || [{ name: '暂无数据', value: 1 }]
        }]
    }, true);

    if (!genreChartInst) genreChartInst = echarts.init(document.getElementById('genreChart'));
    updateGenreChart(globalGenreData);

    if (!radarChartInst) radarChartInst = echarts.init(document.getElementById('radarChart'));
    updateRadarChart(globalRadarData, '整体画像', '#1db954');

    timeChartInst.off('mouseover');
    timeChartInst.off('mouseout');

    timeChartInst.on('mouseover', function (params) {
        const timeBucket = params.name;
        if (currentTimeTasteMap[timeBucket]) {
            updateGenreChart(currentTimeTasteMap[timeBucket].genres);
            updateRadarChart(currentTimeTasteMap[timeBucket].radar, `${timeBucket}画像`, '#1ed760');
        }
    });

    timeChartInst.on('mouseout', function () {
        updateGenreChart(globalGenreData);
        updateRadarChart(globalRadarData, '整体画像', '#1db954');
    });
}


// 13. 动态更新流派偏好的玫瑰色南丁格尔饼图数据
function updateGenreChart(data) {
    genreChartInst.setOption({
        tooltip: { trigger: 'item', backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' } },
        series: [{
            name: '流派偏好', type: 'pie', radius: ['35%', '75%'], roseType: 'radius',
            itemStyle: { borderRadius: 5, borderColor: '#242424', borderWidth: 2 },
            label: { color: '#b3b3b3' },
            data: data,
            color: ['#1db954', '#1ed760', '#658af0', '#b258e6', '#a4b0be'],
            animationDuration: 300
        }]
    }, true);
}


// 14. 动态更新多维音频特征雷达图图表渲染内容
function updateRadarChart(data, seriesName, colorCode) {
    radarChartInst.setOption({
        tooltip: { backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' } },
        radar: {
            indicator: [
                { name: '活力', max: 100 }, { name: '舞动', max: 100 },
                { name: '积极', max: 100 }, { name: '原声', max: 100 }, { name: '现场', max: 100 }
            ],
            axisName: { color: '#888' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
            splitArea: { show: false }
        },
        series: [{
            type: 'radar',
            data: [{
                value: data, name: seriesName,
                areaStyle: { color: colorCode, opacity: colorCode === '#1db954' ? 0.2 : 0.4 },
                lineStyle: { color: colorCode, width: 2 },
                itemStyle: { color: colorCode },
                symbolSize: 6
            }],
            animationDuration: 300
        }]
    }, true);
}


// 15. 渲染 K-Means 深度聚类分析面板，包含特征散点图与各特征簇的微型雷达指标图
function renderClusterAnalysis(clustersInfo, scatterData) {
    const clusterPanel = document.getElementById('clusterPanel');
    if (!clustersInfo || clustersInfo.length === 0) { clusterPanel.style.display = 'none'; return; }
    clusterPanel.style.display = 'block';

    if (!scatterChartInst) scatterChartInst = echarts.init(document.getElementById('scatterChart'));
    const clusterColors = ['#1db954', '#658af0', '#b258e6'];

    scatterChartInst.setOption({
        title: { text: '歌曲特征分布 (Energy vs Valence)', textStyle: { color: '#888', fontSize: 13, fontWeight: 'normal' } },
        tooltip: { formatter: p => `${p.data.name}<br/>能量: ${p.data.value[0]} | 积极: ${p.data.value[1]}`, backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' } },
        xAxis: { name: '能量 (Energy)', nameTextStyle: { color: '#666' }, splitLine: { show: false }, min: 0, max: 100 },
        yAxis: { name: '积极 (Valence)', nameTextStyle: { color: '#666' }, splitLine: { lineStyle: { color: '#282828' } }, min: 0, max: 100 },
        series: [{ type: 'scatter', symbolSize: 10, data: scatterData, itemStyle: { color: p => clusterColors[p.data.cluster % 3], opacity: 0.8 } }]
    }, true);

    document.getElementById('clusterCardsContainer').innerHTML = clustersInfo.map((cluster, idx) => `
        <div class="cluster-card">
            <h4 style="color: ${clusterColors[idx % 3]}">${cluster.name}</h4>
            <div id="miniRadar-${idx}" class="mini-radar-container"></div>
            <ul class="cluster-songs">${cluster.representative_songs.map(s => `<li>🎵 ${s.name} - ${s.artist}</li>`).join('')}</ul>
        </div>
    `).join('');

    miniRadarInsts.forEach(i => i.dispose());
    miniRadarInsts = [];

    clustersInfo.forEach((cluster, idx) => {
        const chart = echarts.init(document.getElementById(`miniRadar-${idx}`));
        chart.setOption({
            tooltip: { show: false },
            radar: { indicator: [{name:'活力',max:100},{name:'舞动',max:100},{name:'积极',max:100},{name:'原声',max:100},{name:'现场',max:100}], radius: '60%', axisName: { color: '#666', fontSize: 10 }, splitLine: { lineStyle: { color: '#282828' } }, splitArea: { show: false } },
            series: [{ type: 'radar', data: [{ value: cluster.center_features, areaStyle: { color: clusterColors[idx % 3], opacity: 0.3 }, lineStyle: { color: clusterColors[idx % 3], width: 1 }, itemStyle: { color: clusterColors[idx % 3] }, symbolSize: 2 }] }]
        });
        miniRadarInsts.push(chart);
    });
}


// 16. 监听浏览器窗口尺寸改变事件以自适应动态重绘所有 ECharts 图表实例
window.addEventListener('resize', () => {
    timeChartInst && timeChartInst.resize();
    genreChartInst && genreChartInst.resize();
    radarChartInst && radarChartInst.resize();
    scatterChartInst && scatterChartInst.resize();
    miniRadarInsts.forEach(i => i.resize());
});