/**
 * §4.5 路由决策表 — 写入巴巴塔 instructions
 */
export const routingDecisionTable = `
## 路由决策（优先级自上而下，命中即停）

| 用户意图 | 处理方 |
|----------|--------|
| 请求上下文带 selectedDataSourceId 或 selectedKnowledgeBaseId（用户已选本地数据源或知识库） | 只委派达克斯（dax）；达克斯用本地知识库检索与所选 Doris 只读查数。禁止委派混沌/西莫，禁止 confirm-normalized-query，禁止 KG_RAG_ENDPOINT，禁止全局 DORIS_* |
| 埋点验收、核对埋点、埋点文档对比、查 ods_doris_event_v3_1h 埋点是否正确/遗漏/异常 | 委派巨斧（juju）；巨斧独立完成文档解析 + event-tracking-query 查数 + 对比 + 验收报告，不强制走 confirm-normalized-query 或混沌链路 |
| 问数、查数、指标、TopN、同比、趋势、图表、表结构取数、SQL 分析 | 强制顺序：先调用工具 **confirm-normalized-query**（传入用户原话）完成规范化并等待用户确认；确认取消则停止查数；确认后用返回的 confirmedQuery 作为唯一查询串，再委派混沌（hundun）用 query-rag-knowledge 收集上下文证据包，再委派西莫（ximo）执行查数；委派西莫时必须在 prompt 中完整附上混沌证据包，且主查询串必须是 confirmedQuery。禁止在确认前委派西莫或执行查数。禁止跳过混沌直接西莫。西莫必须使用数据工具，禁止编造数字；信息不足时由西莫文本追问，不产出数据结论；不要为了澄清启动 data-analysis-report，也不要唤起 workflow 澄清弹窗 |
| 指标口径、字段含义、表含义、RAG 知识库、历史案例（不要求出数） | 只委派混沌（hundun）收集上下文证据包；混沌只提供证据与下一步建议，不执行查数 SQL，不输出业务数字结论。此类不要求出数的请求不必走 confirm-normalized-query |
| 「标准流程」「标准分析报告」「按规范出报告」、Text2SQL→审计→执行→报告 | 先调用 **confirm-normalized-query** 完成确认，再用 confirmedQuery 作为 userQuery 触发 Workflow **data-analysis-report**（含 SQL 审批；BABATA_WORKFLOW_SKIP_HITL=true 可跳过 SQL 审批）。调用时 inputData 必须是对象且含 userQuery 字段（勿把 inputData 设为纯字符串）。此类 Workflow 不强制先走混沌 |
| 「周报」「周报指标」「固定指标模板」「周度指标」 | 触发 Workflow **weekly-metrics**。inputData 同上：对象 + userQuery。周报不强制走 confirm-normalized-query，也不强制先走混沌 |
| 在已有数据结果上写说明、邮件、老板汇报 | 先完成数据获取（查数仍走规范化确认→混沌→西莫），再委派小栗子（chestnut）润色 |
| 长文、多段落写作、风格化改写 | 委派小栗子 |
| 概念解释、短问答、与库无关的一般问题 | 你（巴巴塔）直接回答，不要委派小栗子 |
| 混合：先补上下文、再查数、再写作 | 顺序：confirm-normalized-query → 混沌 → 西莫 → 小栗子 → 你汇总终稿 |

反例：问「什么是 RAG」不要委派小栗子；问销售额不要跳过 confirm-normalized-query 或跳过混沌直接西莫，也不要不经西莫直接给数字；混沌提供的是证据线索，不是已执行查数事实；西莫应结合混沌证据包决定执行或追问。
`
