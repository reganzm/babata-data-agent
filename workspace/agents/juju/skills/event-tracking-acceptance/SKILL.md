---
name: event-tracking-acceptance
description: 当巨斧需要解析用户粘贴的埋点文档、用 event-tracking-query 核验 prod.ods_doris_event_v3_1h 实际上报、从遗漏/缺失/误报三维验证并按 os 与 app_version 下钻、产出总-分结构埋点验收报告时使用。
agent: juju
version: 0.2.0
---

# 巨斧 埋点验收 Skill

## 使用场景

- 用户粘贴埋点文档（事件名、module、content_id、args、备注、上报时机），要求核对埋点是否正确上报。
- 需要判断某事件是否遗漏（该报未报）、缺失（报了但字段空）、误报（不该报却报 / 取值越界）。
- 需要按操作系统、app_version 下钻定位问题范围。
- 需要产出总-分结构的结构化埋点验收报告。

## 工作流程

### 1. 前置确认（按顺序）
1. app_key 是否读取到：
   - 从文档识别本次针对的 app / app_key；调用 `list-app-keys`（默认 app=peanut）拿到有效 app_key 列表做映射。
   - 文档未指明、无法唯一映射时，向用户澄清「要验收哪个 app_key」，并说明「默认用 peanut 全部 app_key」。软澄清——用户未回复或选默认则用全量继续，不阻塞。
2. app_version 是否读取到：
   - 从文档识别版本号（major.minor.patch，如 2.37.3）。
   - 无法唯一确定时停止验收，向用户澄清追问版本号。硬澄清——不默认全量、不自行假设，拿到后再继续。

### 2. 文档解析（重点字段）
逐事件抽取，重点关注：`event_name`、`module`、`content_id`、`args`，以及每条埋点的**备注/说明**（上报时机、条件、特殊约束、允许为空的字段等），备注必须纳入判定依据。其余：必填字段、字段枚举、上报时机、预期量级。

### 3. 三维验证 SQL 设计（每事件组合 event-tracking-query）
- 埋点遗漏：`mode: count` 统计上报量，event_count=0 → 遗漏（先排查事件名拼写、过滤是否过严、ds 分区是否就绪）。
- 埋点缺失：`mode: sample` 取样本查 module/content_id/args 等必填字段是否空；必要时 propertyFilters + count 统计 NULL 占比。
- 埋点误报：`mode: field-stats` 对 module/content_id/args 关键值 GROUP BY 看是否有枚举外值/异常空值/非法类型；结合备注判断是否有不该触发的上报。

### 4. 统计与下钻
1. 先总量：每事件先跑不分组 count，拿整体上报量与去重 uid/device。
2. 再下钻：
   - 分操作系统：field-stats 按 `os` 分组（或按 os 逐个 count），看各平台是否齐全、有无平台性遗漏。
   - 分 app_version：field-stats 按 `app_version` 分组，看是否集中在目标版本及以上、有无低版本混入/高版本缺失。
3. 下钻用于定位问题范围（全局 vs 某 os / 某版本）。

### 5. 产出报告（总-分结构）
- 总览：验收范围（事件、ds 当天、app_key 过滤、版本下限）→ 总体通过率与遗漏/缺失/误报汇总 → 关键问题清单。
- 分项明细：逐事件核验表（事件名 / 检查维度 / 检查项 / 预期 / 实际 / 结论 / 建议）+ 分 os 下钻 + 分 app_version 下钻。
- caveats：数据延迟、当天分区未就绪、样本量不足、范围仅当天等。

## 关键过滤条件

- app_key：peanut 旗下有多个 app_key（各 os 版本），用 `list-app-keys` 查 prod.ods_dim_doris_app_mapping（WHERE app='peanut' AND app_key>0）获取，再通过 event-tracking-query 的 appKeys 过滤。无法确定时默认全量。
- app_version：文档版本号（major.minor.patch）通过 minAppVersion 传入，工具按 `major*10000 + minor*100 + patch` 转 app_version_code，并生成闭区间：下限=该版本本身，上限=下一个 minor 的 .0（2.37.2 → `app_version_code ∈ [23702, 23800]`，即 2.37.2 ~ 2.38.0），只验收目标版本起、封顶到下一个 minor，避免混入更高版本。

## 表与字段要点（prod.ods_doris_event_v3_1h）

- 分区字段：`ds`（int，YYYYMMDD）、`hh`（int，小时）——查询固定裁剪到当天 ds。
- 事件名：`event_name`；事件时间戳：`event_time`（bigint）；事件类型：`event_type`。
- 重点埋点列：`module`、`content_id`（配合 `content_model`）、`args`、`additional_fields`（JSON 自定义参数）；其余 `element_id`、`position`、`duration`、`reference` 等。
- 下钻维度列：`os`、`app_version`、`app_key`、`channel`、`uid`、`device_id`。

## 安全边界

- 所有判定必须基于工具真实返回，禁止编造上报数据或统计值。
- 仅只读查询；固定验收表 prod.ods_doris_event_v3_1h；不执行写入/建表/删除；范围仅系统当天。
- 量级大时先 count 探量再取样本；先总量后下钻。
- 下「遗漏」结论前先确认 ds 分区就绪、事件名拼写、app_key/版本过滤是否过严。
