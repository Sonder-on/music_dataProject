let trendChart, pieChart, radarChart, mapChart;
let realTimeInterval;
let trendDataX = [];
let trendDataPlay = [];
let trendDataSearch = [];


// 1. 页面加载完成时初始化并加载大盘业务数据
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
});


// 2. 异步请求后端API以获取全量仪表盘统计数据
async function loadDashboardData() {
    try {
        const response = await fetch('/api/dashboard');
        const result = await response.json();

        if (result.code === 200) {
            document.getElementById('loader').style.display = 'none';
            document.getElementById('dashboardContent').style.display = 'flex';

            const data = result.data;
            renderLists(data.top_artists, data.top_albums);

            setTimeout(() => {
                initCharts(data.charts);
                initMapChart();
                fetchRegionSpecificData('Global');
            }, 100);

        } else {
            document.getElementById('loader').innerText = "加载失败: " + result.msg;
        }
    } catch (error) {
        document.getElementById('loader').innerHTML = "📊 网络请求失败，请检查后端 API 服务是否启动";
    }
}


// 3. 渲染Top艺人和Top专辑排行列表DOM
function renderLists(artists, albums) {
    const artistListEl = document.getElementById('topArtistList');
    artistListEl.innerHTML = artists.slice(0, 5).map((item, index) => {
        let imgHtml = item.avatar ? `<img src="${item.avatar}">` : '👤';
        return `
            <div class="list-item" style="display: flex; align-items: center; margin-bottom: 12px;">
                <div class="item-rank" style="width: 20px; color: #666; font-weight: bold; text-align: center;">${index + 1}</div>
                <div class="item-img img-circle" style="width: 35px; height: 35px; margin: 0 10px; background: #333; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">${imgHtml}</div>
                <div class="item-info" style="flex: 1; overflow: hidden;">
                    <div class="item-name" style="font-size: 13px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
                    <div class="item-sub" style="font-size: 11px; color: #666;">流行度: ${item.popularity}</div>
                </div>
            </div>`;
    }).join('');

    const albumListEl = document.getElementById('topAlbumList');
    albumListEl.innerHTML = albums.slice(0, 5).map((item, index) => {
        let imgHtml = item.cover ? `<img src="${item.cover}">` : '🎵';
        return `
            <div class="list-item" style="display: flex; align-items: center; margin-bottom: 12px;">
                <div class="item-rank" style="width: 20px; color: #666; font-weight: bold; text-align: center;">${index + 1}</div>
                <div class="item-img img-square" style="width: 35px; height: 35px; margin: 0 10px; background: #333; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center;">${imgHtml}</div>
                <div class="item-info" style="flex: 1; overflow: hidden;">
                    <div class="item-name" style="font-size: 13px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
                    <div class="item-sub" style="font-size: 11px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.artist}</div>
                </div>
            </div>`;
    }).join('');
}


// 4. 初始化折线趋势图、环形饼图和特征雷达图实例
function initCharts(chartData) {
    trendDataX = chartData.trend_x;
    trendDataPlay = chartData.trend_y_play;
    trendDataSearch = chartData.trend_y_search;

    trendChart = echarts.init(document.getElementById('mainTrendChart'));
    trendChart.setOption({
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' } },
        legend: { data: ['全站播放量', '系统检索频次'], textStyle: { color: '#aaa' }, top: 0 },
        grid: { left: '3%', right: '4%', bottom: '5%', top: '40px', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: trendDataX, axisLabel: { color: '#888' } },
        yAxis: { type: 'value', axisLabel: { color: '#888' }, splitLine: { lineStyle: { color: '#333' } } },
        series: [
            {
                name: '全站播放量', type: 'line', smooth: true, itemStyle: { color: '#2ed573' }, lineStyle: { width: 3 },
                areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(46, 213, 115, 0.3)' }, { offset: 1, color: 'rgba(46, 213, 115, 0)' }]) },
                data: trendDataPlay
            },
            {
                name: '系统检索频次', type: 'line', smooth: true, itemStyle: { color: '#658af0' }, lineStyle: { width: 3 },
                areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(101, 138, 240, 0.3)' }, { offset: 1, color: 'rgba(101, 138, 240, 0)' }]) },
                data: trendDataSearch
            }
        ]
    });

    pieChart = echarts.init(document.getElementById('genrePieChart'));
    pieChart.setOption({
        tooltip: { trigger: 'item', backgroundColor: 'rgba(36,36,38,0.9)', textStyle: { color: '#fff' } },
        color: ['#658af0', '#2ed573', '#ffa502', '#ff4757', '#a4b0be'],
        legend: { bottom: '0', left: 'center', textStyle: { color: '#aaa' }, icon: 'circle' },
        series: [{
            name: '占比', type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
            avoidLabelOverlap: false, itemStyle: { borderRadius: 6, borderColor: '#242426', borderWidth: 2 },
            label: { show: false }, data: chartData.genres
        }]
    });

    radarChart = echarts.init(document.getElementById('featureRadarChart'));
    radarChart.setOption({
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
                value: chartData.features, name: '大盘特征',
                areaStyle: { color: 'rgba(255, 165, 2, 0.3)' },
                lineStyle: { color: '#ffa502' }, itemStyle: { color: '#ffa502' }
            }]
        }]
    });

    if (realTimeInterval) clearInterval(realTimeInterval);
    realTimeInterval = setInterval(fetchRealtimeData, 3000);
}


// 5. 初始化交互式全球流派分布盲盒地图
function initMapChart() {
    mapChart = echarts.init(document.getElementById('worldMapChart'));

    const genres = ['Pop', 'Rock', 'K-pop', 'J-pop', 'Rap', 'Latin', 'Electronic', 'C-pop'];
    const colors = ['#658af0', '#ff4757', '#ffa502', '#ff6b81', '#2ed573', '#eccc68', '#7bed9f', '#b258e6'];

    const rawMapData = [
        {name: 'United States', genre: 'Pop', apiName: 'United States'},
        {name: 'China', genre: 'C-pop', apiName: 'China'},
        {name: 'United Kingdom', genre: 'Rock', apiName: 'United Kingdom'},
        {name: 'Japan', genre: 'J-pop', apiName: 'Japan'},
        {name: 'Korea', genre: 'K-pop', apiName: 'South Korea'},
        {name: 'Canada', genre: 'Rap', apiName: 'Canada'},
        {name: 'Brazil', genre: 'Latin', apiName: 'Brazil'},
        {name: 'Mexico', genre: 'Latin', apiName: 'Mexico'},
        {name: 'Spain', genre: 'Latin', apiName: 'Spain'},
        {name: 'Argentina', genre: 'Latin', apiName: 'Argentina'},
        {name: 'Colombia', genre: 'Latin', apiName: 'Colombia'},
        {name: 'Germany', genre: 'Electronic', apiName: 'Germany'},
        {name: 'France', genre: 'Electronic', apiName: 'France'},
        {name: 'Russia', genre: 'Electronic', apiName: 'Russia'},
        {name: 'Australia', genre: 'Pop', apiName: 'Australia'},
        {name: 'South Africa', genre: 'Pop', apiName: 'South Africa'},
        {name: 'Italy', genre: 'Pop', apiName: 'Italy'},
        {name: 'Sweden', genre: 'Pop', apiName: 'Sweden'},
        {name: 'India', value: 'Pop', apiName: 'India'},
        {name: 'Egypt', value: 'Rap', apiName: 'Egypt'},
        {name: 'New Zealand', value: 'Pop', apiName: 'New Zealand'}
    ];

    let currentMapData = rawMapData.map(item => {
        let trueColorIdx = genres.indexOf(item.genre);
        let trueColor = trueColorIdx > -1 ? colors[trueColorIdx] : '#fff';
        let randomColor = colors[Math.floor(Math.random() * colors.length)];

        return {
            name: item.name,
            apiName: item.apiName,
            genre: item.genre,
            trueColor: trueColor,
            revealed: false,
            itemStyle: {
                areaColor: randomColor
            }
        };
    });

    mapChart.setOption({
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(36,36,38,0.9)',
            textStyle: { color: '#fff' },
            formatter: function (params) {
                if (!params.data) {
                    return `${params.name}<br/><span style="font-size:12px;color:#888">点击探索该国数据</span>`;
                }

                let data = params.data;
                if (data.revealed) {
                    let dot = `<span style="display:inline-block;margin-right:5px;border-radius:50%;width:10px;height:10px;background-color:${data.trueColor}"></span>`;
                    return `${params.name}<br/>${dot} 主导流派: <b style="color:${data.trueColor}">${data.genre}</b>`;
                } else {
                    return `${params.name}<br/><span style="font-size:12px;color:#aaa">❓ 未知音乐领域 (点击揭晓)</span>`;
                }
            }
        },
        visualMap: {
            type: 'piecewise',
            categories: genres,
            inRange: { color: colors },
            outOfRange: { color: '#2b2b2c' },
            seriesIndex: [],
            left: '3%', bottom: '5%',
            textStyle: { color: '#aaa', fontSize: 12 },
            itemWidth: 14, itemHeight: 14,
            orient: 'vertical',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: 12, borderRadius: 8
        },
        series: [
            {
                name: '流派分布',
                type: 'map',
                map: 'world',
                roam: true,
                zoom: 1.2,
                label: { show: false },
                itemStyle: {
                    areaColor: '#2b2b2c',
                    borderColor: '#1e1e20',
                    borderWidth: 1
                },
                emphasis: {
                    label: { show: true, color: '#fff' },
                    itemStyle: {
                        borderColor: '#fff', borderWidth: 1.5,
                        shadowBlur: 10, shadowColor: 'rgba(255, 255, 255, 0.5)'
                    }
                },
                data: currentMapData
            }
        ]
    });

    mapChart.on('click', (params) => {
        if (params.name) {
            let targetIdx = currentMapData.findIndex(d => d.name === params.name);

            if (targetIdx > -1 && !currentMapData[targetIdx].revealed) {
                currentMapData[targetIdx].itemStyle.areaColor = currentMapData[targetIdx].trueColor;
                currentMapData[targetIdx].revealed = true;

                mapChart.setOption({
                    series: [{
                        data: currentMapData
                    }]
                });
            }

            let targetName = params.data?.apiName || params.name;
            fetchRegionSpecificData(targetName);
        }
    });
}


// 6. 点击地图国家时异步请求并展示该地区的具体音乐偏好与热门曲目
async function fetchRegionSpecificData(regionName) {
    const titleEl = document.getElementById('regionPanelTitle');
    const loadingEl = document.getElementById('regionLoading');
    const contentEl = document.getElementById('regionDetailContent');
    const trackListEl = document.getElementById('regionTrackList');

    titleEl.innerText = `地域热门分析 (${regionName})`;
    contentEl.style.display = 'none';
    loadingEl.style.display = 'block';
    loadingEl.innerHTML = `<div style="font-size: 24px; margin-bottom: 10px;">🌍</div>正在跨站同步 ${regionName} 数据...`;

    try {
        const response = await fetch(`/api/region_data?region=${encodeURIComponent(regionName)}`);
        const result = await response.json();

        if (result.code === 200) {
            loadingEl.style.display = 'none';
            contentEl.style.display = 'flex';

            const data = result.data;
            document.getElementById('regionMainGenre').innerText = data.mainGenre;
            document.getElementById('regionListeners').innerText = data.listeners;

            trackListEl.innerHTML = data.tracks.map((track, index) => {
                let imgHtml = track.cover_url ? `<img src="${track.cover_url}" style="width: 100%; height: 100%; object-fit: cover;">` : '🎵';
                return `
                    <div class="list-item" style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
                        <div style="width: 25px; font-weight: bold; color: #555; text-align: center;">${index + 1}</div>
                        <div class="img-square" style="width: 40px; height: 40px; margin: 0 12px; background: #333; border-radius: 4px; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">${imgHtml}</div>
                        <div style="flex: 1; overflow: hidden;">
                            <div style="font-size: 13px; color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">${track.title}</div>
                            <div style="font-size: 11px; color: #888; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${track.artist}</div>
                        </div>
                    </div>`;
            }).join('');
        } else {
            loadingEl.innerHTML = `<div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>获取该地区数据失败或暂无公开榜单`;
        }
    } catch (err) {
        loadingEl.innerHTML = `<div style="font-size: 24px; margin-bottom: 10px;">❌</div>请求异常，请稍候重试`;
    }
}


// 7. 定时轮询接口动态更新趋势图末尾节点模拟实时流量变化
async function fetchRealtimeData() {
    try {
        const res = await fetch('/api/realtime_trend');
        const result = await res.json();
        if (result.code === 200) {
            const data = result.data;
            let lastIdx = trendDataPlay.length - 1;
            trendDataPlay[lastIdx] += data.play;
            trendDataSearch[lastIdx] += data.search;
            trendChart && trendChart.setOption({ series: [{ data: trendDataPlay }, { data: trendDataSearch }] });
        }
    } catch (e) {}
}


// 8. 监听窗口缩放事件自适应重绘所有图表
window.addEventListener('resize', () => {
    trendChart && trendChart.resize();
    pieChart && pieChart.resize();
    radarChart && radarChart.resize();
    mapChart && mapChart.resize();
});