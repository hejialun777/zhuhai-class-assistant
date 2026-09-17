/* =========================================================================
 * data.js — 课表 / 校园地点 / 路网 基础数据
 * 数据来源：吉猪生活+ 课表截图（第3周）、学校平面示意图
 * 老师姓名由用户按「周一至周五、每天从早到晚」的顺序提供，共 13 位
 * （不含周五 1-2 节「形势与政策I」——该课标注「多周后」开课，未提供老师）。
 * ========================================================================= */

/* ---------- 学期与周次 ---------- */
const TERM = {
  // 第3周 = 2026-09-14(周一) ~ 09-20(周日)，故第1周周一为 2026-08-31
  week1Monday: '2026-08-31',
  totalWeeks: 20,
};

/* ---------- 作息时间 ---------- */
const PERIODS = [
  { no: 1,  start: '08:00', end: '08:45' },
  { no: 2,  start: '08:55', end: '09:40' },
  { no: 3,  start: '10:20', end: '11:05' },
  { no: 4,  start: '11:15', end: '12:00' },
  { no: 5,  start: '14:00', end: '14:45' },
  { no: 6,  start: '14:55', end: '15:40' },
  { no: 7,  start: '16:00', end: '16:45' },
  { no: 8,  start: '16:55', end: '17:40' },
  { no: 9,  start: '19:00', end: '19:45' },
  { no: 10, start: '19:55', end: '20:40' },
  { no: 11, start: '20:50', end: '21:35' },
  { no: 12, start: '21:45', end: '22:30' },
];

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/* ---------- 课程 ----------
 * day: 1=周一 ... 7=周日
 * periods: 占用节次
 * weeks: {type:'all'} | {type:'odd'} | {type:'even'} | {type:'range',from,to} | {type:'later'}
 */
const COURSES = [
  {
    id: 'c-prog-mon',
    name: '程序设计基础',
    teacher: '陈楚汉',                       // ← 老师姓名待补充
    day: 1, periods: [1, 2],
    building: '明德楼', placeId: 'mingde', room: '小教A418',
    color: '#e8695f', weeks: { type: 'all' },
  },
  {
    id: 'c-xjp-thu',
    name: '习近平新时代中国特色社会主义思想概论',
    shortName: '习思想概论',
    teacher: '李洪宾',
    day: 4, periods: [1, 2],
    building: '明德楼', placeId: 'mingde', room: '阶梯B105',
    color: '#6b74c9', weeks: { type: 'all' },
  },
  {
    id: 'c-xingshi-fri',
    name: '形势与政策I',
    teacher: '',
    day: 5, periods: [1, 2],
    building: '博文楼', placeId: 'bowen', room: '阶梯D301',
    color: '#b6b6b6', weeks: { type: 'later' },
    note: '课表标注「多周后」，开课周次待确认',
  },
  {
    id: 'c-se-intro-tue',
    name: '软件工程专业导论',
    teacher: '王舒',
    day: 2, periods: [3, 4],
    building: '博文楼', placeId: 'bowen', room: '阶梯E105',
    color: '#f0a06a', weeks: { type: 'all' },
  },
  {
    id: 'c-prog-wed',
    name: '程序设计基础',
    teacher: '陈楚汉',
    day: 3, periods: [3, 4],
    building: '明德楼', placeId: 'mingde', room: '小教A413',
    color: '#e8695f', weeks: { type: 'all' },
  },
  {
    id: 'c-prog-thu',
    name: '程序设计基础',
    teacher: '陈楚汉',
    day: 4, periods: [3, 4],
    building: '敏学楼', placeId: 'minxue', room: '227',
    color: '#e8695f', weeks: { type: 'all' },
  },
  {
    id: 'c-eng-fri',
    name: '大学英语B I',
    teacher: '王莉娜',
    day: 5, periods: [3, 4],
    building: '博文楼', placeId: 'bowen', room: '小教D506',
    color: '#8bc34a', weeks: { type: 'all' },
  },
  {
    id: 'c-math-mon',
    name: '高等数学A I',
    teacher: '甄苓',
    day: 1, periods: [5, 6],
    building: '博文楼', placeId: 'bowen', room: '阶梯D301',
    color: '#5b9bd5', weeks: { type: 'all' },
  },
  {
    id: 'c-swim-tue',
    name: '游泳',
    teacher: '侯沛伟',
    day: 2, periods: [5, 6],
    building: '游泳馆', placeId: 'swim', room: '游泳馆',
    color: '#3fb6a8', weeks: { type: 'all' },
  },
  {
    id: 'c-math-wed',
    name: '高等数学A I',
    teacher: '甄苓',
    day: 3, periods: [5, 6],
    building: '博文楼', placeId: 'bowen', room: '阶梯D301',
    color: '#5b9bd5', weeks: { type: 'all' },
  },
  {
    id: 'c-se-intro-thu',
    name: '软件工程专业导论',
    teacher: '王舒',
    day: 4, periods: [5, 6],
    building: '六教', placeId: 'liujiao', room: 'M515',
    color: '#f0a06a', weeks: { type: 'all' },
  },
  {
    id: 'c-math-fri',
    name: '高等数学A I',
    teacher: '甄苓',
    day: 5, periods: [5, 6],
    building: '博文楼', placeId: 'bowen', room: '阶梯D301',
    color: '#5b9bd5', weeks: { type: 'all' },
  },
  {
    id: 'c-mil-tue',
    name: '军事理论',
    teacher: '叶婷婷',
    day: 2, periods: [9, 10],
    building: '博文楼', placeId: 'bowen', room: '阶梯D202',
    color: '#ef9a9a', weeks: { type: 'all' },
  },
  {
    id: 'c-xjp-wed',
    name: '习近平新时代中国特色社会主义思想概论',
    shortName: '习思想概论',
    teacher: '李洪宾',
    day: 3, periods: [9, 10],
    building: '明德楼', placeId: 'mingde', room: '阶梯B104',
    color: '#6b74c9', weeks: { type: 'all' },
  },
];

/* ---------- 校园地点 ----------
 * x / y 为示意图上的像素坐标（底图 1280 × 587）
 * node 为该地点最近的路网节点（用于路线规划）
 * needsCheck: 位置未经确认，建议在地图上拖拽校准
 */
const PLACES = [
  // —— 上课地点 ——
  { id:'mingde',  name:'明德楼', short:'明德楼', full:'明德楼（第一教学楼）', x:470, y:300, node:'md',  cat:'教学楼',
    rooms:['小教A418','小教A413','阶梯B105','阶梯B104'] },
  { id:'bowen',   name:'博文楼', short:'博文楼', full:'博文楼（第二教学楼）', x:560, y:280, node:'bw',  cat:'教学楼',
    rooms:['阶梯D301','阶梯E105','阶梯D202','小教D506'] },
  { id:'minxue',  name:'敏学楼', short:'敏学楼', full:'敏学楼（实验楼）',     x:659, y:280, node:'mx',  cat:'教学楼', rooms:['227'] },
  { id:'zhixing', name:'知行楼', short:'知行楼', full:'知行楼（第三教学楼）', x:495, y:361, node:'zx',  cat:'教学楼' },
  { id:'liujiao', name:'六教',   short:'六教',   full:'第六教学楼',          x:712, y:274, node:'jj_up', cat:'教学楼', rooms:['M515'],
    needsCheck:true, note:'示意图未标注「第六教学楼」，按「敏学楼右上方空地、靠近球场」定位，请实地核对' },
  { id:'swim',    name:'游泳馆', short:'游泳馆', full:'游泳馆',              x:219, y:219, node:'yy',  cat:'体育' },

  // —— 其他常用地点 ——
  { id:'lib',     name:'图书馆', short:'图书馆', full:'行政楼 / 图书馆',      x:574, y:333, node:'lib', cat:'公共' },
  { id:'track',   name:'田径场', short:'田径场', full:'田径运动场',          x:248, y:177, node:'yy',  cat:'体育' },
  { id:'zwy',     name:'知味园', short:'知味园', full:'知味园（旧饭堂）',     x:288, y:238, node:'rs_1',cat:'餐饮' },
  { id:'sxy',     name:'膳香园', short:'膳香园', full:'膳香园（新饭堂）',     x:762, y:262, node:'sx',  cat:'餐饮' },
  { id:'huan',    name:'湖心湖', short:'湖心湖', full:'湖心湖',              x:345, y:321, node:'hx_n',cat:'景观' },
  { id:'golf',    name:'高尔夫中心', short:'高尔夫', full:'高尔夫教学中心',   x:275, y:398, node:'hx_w',cat:'体育' },

  // —— 宿舍区 ——
  { id:'zhuyuan1', name:'竹园1栋', short:'竹园1栋', x:200, y:265, node:'rs_1', cat:'宿舍' },
  { id:'rongyuan1',name:'榕园1栋', short:'榕园1栋', x:543, y:213, node:'ry_a', cat:'宿舍' },
  { id:'rongyuan4',name:'榕园4栋', short:'榕园4栋', x:480, y:207, node:'ry_w', cat:'宿舍' },
  { id:'rongyuan12',name:'榕园12栋',short:'榕园12栋',x:643, y:206, node:'ry_b', cat:'宿舍' },
  { id:'meiyuan6', name:'梅园6栋', short:'梅园6栋', x:737, y:231, node:'my',   cat:'宿舍' },
  { id:'songyuan2',name:'松园2栋', short:'松园2栋', x:624, y:196, node:'ry_b', cat:'宿舍' },
  { id:'teacher',  name:'教师公寓', short:'教师公寓', full:'教师公寓 / 榕园5栋', x:899, y:330, node:'js', cat:'宿舍' },
  { id:'kangyuan2',name:'康园2栋', short:'康园2栋', full:'康园2栋 / 五环体育馆', x:828, y:261, node:'ky', cat:'宿舍' },
  { id:'wuhuan',   name:'五环体育馆', short:'五环体育馆', x:275, y:340, node:'hx_w', cat:'体育' },
  { id:'yayun',    name:'雅韵楼', short:'雅韵楼', full:'雅韵楼（音乐舞蹈学院）', x:187, y:346, node:'ya', cat:'教学楼' },
  { id:'guoxue',   name:'国学院', short:'国学院', x:388, y:163, node:'gy', cat:'教学楼' },
  { id:'kuaidi',   name:'快递中心', short:'快递中心', full:'快递服务中心', x:712, y:300, node:'kd', cat:'生活' },

  // —— 校门 / 交通 ——
  { id:'nanmen',  name:'南门巴士总站', short:'南门巴士总站', x:145, y:97,  node:'nanmen1', cat:'交通' },
  { id:'gate1',   name:'南一门', short:'南一门', x:90,  y:225, node:'nanmen1', cat:'校门' },
  { id:'gate2',   name:'南二门', short:'南二门', x:96,  y:312, node:'nanmen2', cat:'校门' },
  { id:'east',    name:'东门',   short:'东门',   x:457, y:440, node:'b_470',   cat:'校门' },
];

/* ---------- 路网（沿示意图主干道描点，坐标同底图像素） ---------- */
const ROAD = {
  nodes: {
    // 西侧纵向（南一门 - 南二门 - 金湾东路西端）
    nanmen1:  [ 95, 225],
    nanmen2:  [ 95, 312],
    // 安基东路
    aj_up:    [134, 310],
    aj_low:   [134, 430],
    // 榕树大道（自西向东，经 12—7—8—9—10 号路口；东段渐低）
    rs_0:     [176, 309],
    rs_1:     [250, 300],
    rs_2:     [330, 282],
    rs_3:     [400, 262],
    rs_4:     [471, 240],
    rs_5:     [540, 230],
    rs_6:     [616, 244],
    rs_7:     [686, 257],
    rs_8:     [750, 278],
    // 榕园大街（榕园宿舍北侧）
    gy:       [420, 205],
    ry_w:     [480, 204],
    ry_a:     [560, 204],
    ry_b:     [640, 205],
    my:       [712, 240],
    jsbg:     [438, 140],
    // 湖心湖环湖路
    hx_n:     [345, 252],
    hx_e:     [412, 310],
    hx_s:     [400, 368],
    hx_w:     [300, 340],
    // 校训路（榕园大街南下，绕碧瑶湖东侧接教学区）
    xun:      [607, 262],
    // 教学区
    md_n:     [478, 268],
    md:       [470, 300],
    md_s:     [470, 340],
    bw:       [560, 283],
    mx:       [659, 280],
    jj_up:    [688, 285],
    jj_low:   [688, 360],
    lib:      [574, 333],
    zx:       [499, 358],
    de:       [452, 372],
    yy:       [219, 230],
    // 雅韵楼路口
    ya:       [172, 322],
    // 游泳馆支路
    yy_j:     [219, 300],
    // 东区（政和大道，经 10、11 号路口向东南）
    kd:       [718, 292],
    sx:       [755, 280],
    zh:       [795, 297],
    ky:       [830, 290],
    ky_e:     [932, 314],
    ky_s:     [835, 400],
    js:       [900, 331],
    // 南侧主干道 金湾东路
    b_95:     [ 95, 430],
    b_215:    [215, 430],
    b_316:    [316, 430],
    b_400:    [400, 430],
    b_470:    [470, 430],
    b_560:    [560, 430],
    b_660:    [660, 430],
    b_740:    [740, 430],
    b_830:    [830, 430],
    b_940:    [940, 430],
    b_1050:   [1050,430],
    b_1140:   [1140,430],
  },
  edges: [
    // 西侧纵线
    ['nanmen1','nanmen2'], ['nanmen2','b_95'],
    // 安基东路
    ['aj_up','aj_low'], ['aj_low','b_95'], ['aj_up','rs_0'], ['nanmen2','rs_0'],
    ['aj_up','ya'], ['ya','rs_0'],
    // 榕树大道
    ['rs_0','rs_1'], ['rs_1','rs_2'], ['rs_2','rs_3'], ['rs_3','rs_4'],
    ['rs_4','rs_5'], ['rs_5','rs_6'], ['rs_6','rs_7'], ['rs_7','rs_8'],
    // 榕园大街
    ['rs_4','ry_w'], ['ry_w','ry_a'], ['rs_5','ry_a'], ['ry_a','ry_b'],
    ['ry_b','my'], ['my','rs_7'], ['rs_3','gy'], ['gy','jsbg'], ['rs_4','jsbg'],
    // 校训路：榕园大街 → 教学区
    ['rs_6','xun'], ['xun','bw'], ['xun','mx'], ['xun','jj_up'],
    // 湖心湖环线
    ['rs_2','hx_n'], ['hx_n','hx_e'], ['hx_e','rs_3'], ['hx_e','hx_s'],
    ['hx_s','hx_w'], ['hx_w','hx_n'], ['hx_w','rs_1'], ['hx_w','golf_j'],
    // 湖心湖 — 南侧主干道
    ['hx_s','b_400'], ['hx_w','b_316'], ['hx_e','md'],
    // 教学区
    ['rs_4','md_n'], ['md_n','md'], ['md','md_s'], ['md','bw'], ['bw','mx'],
    ['mx','jj_up'], ['jj_up','jj_low'], ['jj_low','b_660'],
    ['md','lib'], ['bw','lib'], ['lib','zx'], ['md_s','zx'], ['zx','de'],
    ['de','hx_s'], ['de','b_470'], ['lib','jj_low'],
    // 游泳馆
    ['rs_1','yy_j'], ['yy_j','yy'], ['yy_j','b_215'],
    // 东区
    ['jj_low','kd'], ['kd','sx'], ['sx','zh'], ['zh','ky'], ['ky','ky_e'],
    ['ky_e','js'], ['ky','ky_s'], ['ky_s','b_830'], ['js','ky_e'], ['ky_s','b_940'],
    ['sx','rs_8'], ['my','rs_8'],
    // 金湾东路
    ['b_95','b_215'], ['b_215','b_316'], ['b_316','b_400'], ['b_400','b_470'],
    ['b_470','b_560'], ['b_560','b_660'], ['b_660','b_740'], ['b_740','b_830'],
    ['b_830','b_940'], ['b_940','b_1050'], ['b_1050','b_1140'],
  ],
};
// 高尔夫教学中心支点
ROAD.nodes.golf_j = [275, 400];
ROAD.edges.push(['golf_j', 'b_316']);

/* ---------- 出行参数 ---------- */
const TRAVEL = {
  metersPerPx: 2.0,      // 底图像素 → 实际米数（可在设置里调整）
  walkSpeed: 1.15,       // m/s ≈ 4.1 km/h
  bikeSpeed: 4.2,        // m/s ≈ 15 km/h
  walkFixed: 60,         // 步行固定耗时（进出楼、等电梯等），秒
  bikeFixed: 120,        // 骑行固定耗时（取车、停车），秒
};

/* ---------- 地理定位锚点 ----------
 * 用于把手机 GPS 坐标映射到示意图坐标系。
 * 锚点：示意图像素 (600, 270) ≈ 珠海科技学院中心 22.05346N, 113.39902E
 */
const GEO = {
  anchorPx: { x: 600, y: 270 },
  anchorLatLng: { lat: 22.05346, lng: 113.39902 },
  metersPerDegLat: 111320,
  metersPerDegLng: 103180,   // 111320 * cos(22.05°)
};
