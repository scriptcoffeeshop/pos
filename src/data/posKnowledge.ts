export type PosKnowledgeCategory = 'orders' | 'online' | 'payments' | 'supply' | 'printing' | 'register'
export type PosKnowledgeTarget = 'order' | 'queue' | 'printing' | 'closeout' | 'admin' | 'online'

export interface PosKnowledgeCategoryOption {
  value: PosKnowledgeCategory
  label: string
}

export interface PosKnowledgeArticle {
  id: string
  category: PosKnowledgeCategory
  title: string
  summary: string
  steps: string[]
  keywords: string[]
  target: PosKnowledgeTarget
}

export const posKnowledgeCategories: PosKnowledgeCategoryOption[] = [
  { value: 'orders', label: '點餐' },
  { value: 'online', label: '線上' },
  { value: 'payments', label: '付款' },
  { value: 'supply', label: '供應' },
  { value: 'printing', label: '列印' },
  { value: 'register', label: '班別' },
]

export const posKnowledgeArticles: PosKnowledgeArticle[] = [
  {
    id: 'takeout-order',
    category: 'orders',
    title: '新增外帶與快速加購',
    summary: '櫃台尖峰時先建立外帶票券，再用快速加購、分類與搜尋完成品項。',
    steps: [
      '從工具箱或訂單頁按「新增外帶」進入點餐工作區。',
      '用右側分類、搜尋或快速加購加入品項；常用品項會跨重啟保留。',
      '在左側票券直接調整顧客、取餐方式、付款方式與常用備註。',
      '確認數量與金額後按「建立訂單」，成功後顧客電話與備註會自動重置。',
    ],
    keywords: ['外帶', '點餐', '快速加購', '備註', '建立訂單', '搜尋'],
    target: 'order',
  },
  {
    id: 'online-claim',
    category: 'online',
    title: '處理線上/掃碼新單',
    summary: '線上與掃碼新單會進訂單佇列，逾時未確認時會顯示提醒並可前景播放提示音。',
    steps: [
      '進入「訂單」工作區，查看上方線上新單提醒或用來源篩選找線上/掃碼單。',
      '先按「鎖定」接手，避免另一台平板同時處理同一張單。',
      '確認付款狀態；待收款或已授權時，先完成收款或入帳。',
      '按「製作」「完成」「交付」推進狀態，必要時展開明細確認履約時間與備註。',
    ],
    keywords: ['線上', '掃碼', '提醒', '鎖定', '接手', '新單', '履約'],
    target: 'queue',
  },
  {
    id: 'payment-exception',
    category: 'payments',
    title: '收款、作廢與退款',
    summary: '付款動作集中在訂單列，可依狀態處理待收、已授權、已付款與異常訂單。',
    steps: [
      '待收款訂單按「收款」；已授權訂單按「入帳」。',
      '未收款且不再製作時按「作廢」，作廢會排除關帳統計。',
      '已收款訂單需取消時按「退款」，系統會寫入負數交易流水。',
      '不能操作時看按鈕文字，會標示已退款、付款逾期、已交付或先接手等原因。',
    ],
    keywords: ['收款', '入帳', '作廢', '退款', '付款逾期', '交易流水'],
    target: 'queue',
  },
  {
    id: 'fulfillment-alerts',
    category: 'orders',
    title: '取餐/送達時間預警',
    summary: '訂單查詢會標示已逾時、15 分鐘內與已排程訂單，尖峰時先處理到點票券。',
    steps: [
      '進入「訂單」工作區，先查看上方履約時間預警是否有已逾時或 15 分鐘內訂單。',
      '按「已逾時」「15 分內」或時段快篩，把列表縮到需要立即處理的訂單。',
      '依排序先處理最接近的取餐/送達時間，完成製作後按「完成」或「交付」。',
      '若顧客改時間，展開明細確認履約欄位，再依門市流程重建或備註交接。',
    ],
    keywords: ['取餐', '送達', '履約', '逾時', '15 分鐘', '排程', '時段'],
    target: 'queue',
  },
  {
    id: 'supply-batch',
    category: 'supply',
    title: '暫停/恢復商品供應',
    summary: '前台操作頁可用 PIN 載入商品，依搜尋、分類與狀態批次暫停或恢復。',
    steps: [
      '進入「列印 / 前台操作」，輸入管理 PIN 後載入完整商品清單。',
      '用搜尋、分類與狀態篩選找出要處理的商品。',
      '確認篩選結果後使用批次暫停或批次恢復；單品也可直接切換。',
      '低庫存與售完狀態會在點餐端阻擋下單，避免現場超賣。',
    ],
    keywords: ['供應', '暫停', '恢復', '批次', '低庫存', '售完', 'PIN'],
    target: 'printing',
  },
  {
    id: 'printer-reprint',
    category: 'printing',
    title: '出單機與重新列印',
    summary: '列印站依後台規則拆分收據/貼紙，Android APK 會逐筆送到 GODEX DT2X。',
    steps: [
      '在「列印」工作區確認目前出單機 IP、連線狀態與最後列印時間。',
      '用 healthcheck 送出測試標籤，瀏覽器版只建立預覽與 print job。',
      '訂單列可按「出單」或「重印」，列印工作會顯示成功、失敗或略過。',
      '若 LAN 失敗，先確認平板與 GODEX 是否在同一網段，再回到後台檢查出單機設定。',
    ],
    keywords: ['列印', '出單', '重印', 'GODEX', 'LAN', '貼紙', '收據'],
    target: 'printing',
  },
  {
    id: 'register-closeout',
    category: 'register',
    title: '開班與關帳異常',
    summary: '班別頁會整理現金、非現金、待收款、退款、交班預檢與異常數，關班需管理 PIN。',
    steps: [
      '營業開始先開班，填入開班現金與備註。',
      '關班前先看交班預檢，逐項處理未交付、待收款、付款異常、列印失敗與作廢記錄。',
      '點預檢項目可直接帶入今日訂單查詢篩選，回到訂單列完成收款、重印、作廢或交付。',
      '輸入實點現金與管理 PIN 後關班；有異常時需勾選強制確認。',
      '後台營運日報與操作稽核可追查開關班、退款、作廢與商品異動。',
    ],
    keywords: ['開班', '關帳', '關班', '交班', '預檢', '現金', '異常', '日報', '稽核'],
    target: 'closeout',
  },
  {
    id: 'online-settings',
    category: 'online',
    title: '暫停線上點餐與預約設定',
    summary: '後台線上點餐設定會同步影響消費者頁與 POS 新單提醒。',
    steps: [
      '進入後台後輸入管理 PIN，開啟線上點餐設定面板。',
      '需要暫停接單時關閉線上接單，消費者仍可瀏覽菜單但不能加入或送出。',
      '調整平均備餐時間、是否允許預約、未確認提醒分鐘數與提示音。',
      'POS 每 20 秒同步一次 runtime 設定，平板回到前景也會補同步。',
    ],
    keywords: ['線上設定', '暫停接單', '預約', '備餐時間', '提示音', 'runtime'],
    target: 'admin',
  },
]
