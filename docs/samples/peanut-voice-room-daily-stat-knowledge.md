# Peanut 语音房日统计知识库

> 用途：配合 Doris 数据源 `business`，供达克斯检索口径并生成只读 SELECT。  
> 目标表：`business.ads_doris_peanut_voice_room_daily_stat_1d`（语音房间日统计表）

## 表概览

### 粒度与分区

- **粒度**：每个语音房间 × 每个自然日一条记录。
- **主键维度**：`voice_room_id`（语音房间 ID）、`ds`（分区日期，格式 `yyyyMMdd` 字符串或整数，查询时与源表保持一致）。
- **时间辅助字段**：
  - `day_time`：当日 0 点 Unix 秒级时间戳。
  - `week_first_ds`：所在周周一的 `yyyyMMdd` 整数形式，用于周汇总。
- **应用范围**：Peanut 业务，`app = 'peanut'` 的流水与维度均以此为准。

### 表职责

统计语音房间在日维度上的：

- 开播 / 在线时长
- 各类礼物与操作钻石流水
- 进房、停留、送礼、新用户等行为指标
- 公会相关流水与补款
- 上麦主播人数与时长
- 首次进房及首次进房消费

下游可直接对该 ADS 表做聚合分析，无需重复拼多张大宽表。

## 核心指标口径

### 时长类

| 字段 | 含义 | 说明 |
|------|------|------|
| `live_duration` | 房间开启 / 上麦时长（毫秒） | 由 `ods_dim_doris_pn_statistic_log` 中 `VOICE_ROOM_MIKE_DURATION` 按跨日切分累加；仅 `log_ex_mike = 1` |
| `voice_living_time` | 直播间在线时长 | **优先使用此字段**；来自 `ods_dim_doris_peanut_voice_living_time`，比 statistic_log 计算的 live_duration 更准确 |
| `mike_duration` | 公会主播上麦总时长（毫秒） | 仅统计 `room_guild_id = user_guild_id` 的主播上麦 |
| `mike_ancher_num` | 上麦主播人数（去重 uid） | 同上公会身份约束 |
| `mike_30min_ancher_num` | 上麦 ≥ 30 分钟主播人数 | |
| `mike_60min_ancher_num` | 上麦 ≥ 60 分钟主播人数 | |

### 钻石流水类（单位：钻石）

流水主要来自银币账户流 `ods_doris_peanut_coin_currency_account_flow` 与金钱账户流 `ods_doris_peanut_coin_money_account_flow` 合并汇总；部分来自金币账户流 `ods_doris_peanut_coin_gold_account_flow`。

| 字段 | 含义 |
|------|------|
| `gift_diamond_flow_amount` | 普通礼物钻石流水（非幸运、非抽奖、非全麦、非 CP 游戏） |
| `cp_game_gift_diamond_flow_amount` | CP 游戏场景下的普通礼物流水（`ft = 'cp'`） |
| `luck_gift_diamond_flow_amount` | 幸运礼物流水 |
| `cp_game_luck_gift_diamond_flow_amount` | CP 游戏幸运礼物流水 |
| `many_gift_diamond_flow_amount` | 全麦礼物流水（`mt = '1'`） |
| `cp_game_many_gift_diamond_flow_amount` | CP 游戏全麦礼物流水 |
| `back_gift_diamond_flow_amount` | 背包礼物流水（非 STORE 类型） |
| `bean_gift_diamond_flow_amount` | 豆礼物流水（event_type=1004 等） |
| `back_store_gift_diamond_flow_amount` | 背包商店礼物流水（gift_type=STORE） |
| `lottery_gift_diamond_flow_amount` | 抽奖类礼物流水 |
| `discos_gift_diamond_flow_amount` | 迪斯科礼物流水（event_type=1123） |
| `discos_operate_diamond_flow_amount` | 迪斯科操作钻石（金币流 event_type=1120） |
| `discos_match_gift_diamond_flow_amount` | 迪斯科匹配礼物流水（特定 bid 白名单） |
| `critical_gift_diamond_flow_amount` | 暴击礼物流水（event_type=3212，含 fdr 系数） |
| `coin_board_diamond_flow_amount` | 金币板相关钻石流水（业务确认口径） |
| `fans_group_join_diamond_flow_amount` | 粉丝团加入钻石（event_type=3209） |
| `guild_make_up_money_amount` | 公会补款金额（金钱流，gid/rgid 关系判定） |
| `cp_game_guild_make_up_money_amount` | CP 游戏公会补款 |
| `guild_user_diamond_flow_amount` | 公会用户钻石流水（送礼 uid 在公会用户表） |
| `cp_game_guild_user_diamond_flow_amount` | CP 游戏公会用户钻石流水 |
| `normal_user_diamond_flow_amount` | 普通用户钻石流水（非公会 bid） |
| `cp_game_normal_user_diamond_flow_amount` | CP 游戏普通用户钻石流水 |
| `normal_user_silver_diamond_flow_amount` | 银币侧汇总的普通用户流水（与 money 侧字段并存，含义见 ETL） |
| `cp_game_normal_user_silver_diamond_flow_amount` | 银币侧 CP 游戏普通用户流水 |

**CP 游戏判定**：流水 JSON 中 `ft = 'cp'`（flow type）；为空或非 cp 视为普通场景。

**规格过滤**：金钱流中 `spec = '1'` 的流水默认不计入（后续若扩展规格需单独说明）。

### 用户行为类

| 字段 | 含义 | 来源逻辑摘要 |
|------|------|----------------|
| `enter_user` | 进房用户数 | `VOICE_ROOM_LEAVE` 事件按房间+日去重 uid |
| `stay_5min_user` | 停留 ≥ 5 分钟用户数 | 离房事件累计麦位时长 ≥ 300000 ms |
| `gift_user` | 送礼用户数 | 货币流+金钱流送礼 dad_uid 去重 |
| `new_user` | 新注册且当日送礼用户数 | 与 `ods_dim_doris_wormhole_user_1d` 当日 create_ds 关联 |
| `first_enter_user` | 首次进房用户数 | `ads_doris_peanut_first_in_room_data_all`，排除公会用户 |
| `first_enter_consume_user` | 首次进房且当次停留期间消费用户数 | 首次进房时间与流水 create_time 窗口匹配，diamond_cnt > 0 |
| `cp_fight_limit_relation_count` | 首次 CP 限关系用户数 | `dws_doris_peanut_pn_limit_relation_record_stat`，`is_first = 1` |

### 维度类

| 字段 | 含义 |
|------|------|
| `voice_room_type` | 房间类型，来自 `ods_dim_doris_pn_voice_room.room_type` |
| `update_time` | 记录更新时间（毫秒时间戳） |

## 上游依赖表

查询明细或核对口径时可关联以下 ODS/DWS（均在 `business` 库）：

| 表名 | 用途 |
|------|------|
| `ods_dim_doris_pn_statistic_log` | 麦位时长、进房离房行为；关键 event_type：`VOICE_ROOM_MIKE_DURATION`、`VOICE_ROOM_LEAVE` |
| `ods_doris_peanut_coin_currency_account_flow` | 银币账户流水；`type='SILVER'`，`opt=0`；vmid、diamond_cnt 在 note JSON |
| `ods_doris_peanut_coin_money_account_flow` | 金钱账户流水；extend JSON 含 vmid、diamond_cnt、gift_type、ft、mt 等 |
| `ods_doris_peanut_coin_gold_account_flow` | 金币账户；迪斯科操作、粉丝团等 |
| `ods_dim_doris_wormhole_user_1d` | 用户注册日 create_ds，识别新用户 |
| `ods_dim_doris_pn_guild_user` | 公会用户 bid 列表；首次进房统计需排除 |
| `ods_dim_doris_pn_voice_room` | 房间维度与 room_type |
| `ods_dim_doris_peanut_voice_living_time` | 官方直播间在线时长 |
| `ads_doris_peanut_first_in_room_data_all` | 用户首次进房进出的时间窗 |
| `dws_doris_peanut_pn_limit_relation_record_stat` | CP 限关系首次绑定统计 |

## 常见 event_type 速查

| event_type | 业务含义（摘要） |
|------------|------------------|
| 31 | 背包相关送礼 |
| 1004 | 豆送礼 |
| 1018 | 普通送礼 |
| 1123 | 迪斯科送礼 |
| 1134 | 送礼扩展 |
| 1120 | 迪斯科操作（金币流） |
| 3209 | 粉丝团加入 |
| 3212 | 暴击礼物 |

礼物类型 `gift_type` 常见值：`LUCKY`（幸运）、`LOTTERY`（抽奖）、`STORE`（商店背包）。

## 达克斯问数建议

### 推荐查询表

- **聚合分析、看板、趋势**：优先查 `business.ads_doris_peanut_voice_room_daily_stat_1d`。
- **流水明细核对**：再下钻 `ods_doris_peanut_coin_money_account_flow` / `ods_doris_peanut_coin_currency_account_flow`，必须带 `ds` 分区条件。

### 查询规范

- 只读 `SELECT` 或 `WITH ... SELECT`；禁止 INSERT/UPDATE/DELETE。
- 务必带 `ds` 条件，例如：`WHERE ds = '20250830'` 或 `ds BETWEEN '20250801' AND '20250831'`。
- 按房间查：`WHERE voice_room_id = ?`。
- 周汇总可用 `week_first_ds` 分组，不必自行算周起始日。
- 比较「在线时长」时优先用 `voice_living_time`；`live_duration` 为麦位口径，二者不可混为同一指标。

### 示例问题 → 字段映射

| 用户问题 | 建议使用字段 / 写法 |
|----------|---------------------|
| 某天某房间总礼物流水 | `SUM(gift_diamond_flow_amount + luck_gift_diamond_flow_amount + ...)` 或直接问「总钻石流水」需说明是否含 CP/背包 |
| CP 游戏流水占比 | `cp_game_*` 系列字段之和 vs 总量 |
| 房间转化：进房到送礼 | `gift_user / NULLIF(enter_user, 0)` |
| 新用户送礼规模 | `new_user` 或关联 wormhole 用户表 |
| 主播上麦活跃度 | `mike_ancher_num`、`mike_30min_ancher_num` |
| 首次进房消费转化 | `first_enter_consume_user / NULLIF(first_enter_user, 0)` |

### 示例 SQL（只读）

```sql
-- 某房间近 7 日礼物流水与进房趋势
SELECT
  ds,
  voice_room_id,
  gift_diamond_flow_amount,
  enter_user,
  gift_user,
  voice_living_time
FROM business.ads_doris_peanut_voice_room_daily_stat_1d
WHERE voice_room_id = 123456
  AND ds >= '20250824'
  AND ds <= '20250830'
ORDER BY ds
LIMIT 1000
```

```sql
-- 按周汇总房间平均在线时长（优先 voice_living_time）
SELECT
  week_first_ds,
  voice_room_id,
  AVG(voice_living_time) AS avg_living_time
FROM business.ads_doris_peanut_voice_room_daily_stat_1d
WHERE ds >= '20250801'
  AND ds <= '20250831'
GROUP BY week_first_ds, voice_room_id
ORDER BY week_first_ds, voice_room_id
LIMIT 1000
```

## 口径注意事项

1. **2024-05-10 起**：金额类指标由 `coin_currency_account_flow` 与 `coin_money_account_flow` 合并累加，勿只查单表以免漏数。
2. **live_duration vs voice_living_time**：报表展示「直播间在线」用后者；前者为麦位事件切分时长。
3. **公会用户**：首次进房指标已排除公会用户；公会流水单独有 `guild_user_*` 字段。
4. **跨日麦位**：时长类指标对跨零点 session 做了按小时切分，与简单 sum(duration) 不同。
5. **分区占位符**：ETL 脚本中的 `${yyyymmdd}`、`${1_yyyymmdd}` 为调度参数；交互查询需替换为具体日期。

## 术语表

| 术语 | 说明 |
|------|------|
| 语音房 / voice_room |  Peanut 语音直播间，主键 `voice_room_id` |
| 钻石流水 | 用户消费折算的钻石金额，gift 类 event 汇总 |
| CP 游戏 | 特定玩法场景，流水 extend.ft = 'cp' |
| 全麦 | 多人礼物，mt = '1' |
| 迪斯科 | 房间互动玩法，event 1123/1120 等 |
| ds | 数据日期分区，格式 yyyyMMdd |
