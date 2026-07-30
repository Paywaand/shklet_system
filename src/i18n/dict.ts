/**
 * Shklet i18n — shared dictionary shape.
 *
 * `en.ts` and `ku.ts` must each satisfy this exact type. Because both files
 * are declared as `satisfies Dict`, a key present in one language but
 * missing (or misspelled) in the other becomes a TypeScript compile error
 * — not a silent runtime fallback. Never add a string to one language file
 * without immediately adding its sibling to the other.
 *
 * Strings that take runtime values use `{placeholder}` tokens, filled in by
 * the `t()` interpolation helper (see `src/i18n/index.tsx`).
 */

export interface Dict {
  common: {
    cancel: string;
    save: string;
    saveChanges: string;
    delete: string;
    edit: string;
    add: string;
    addNew: string;
    confirm: string;
    close: string;
    back: string;
    next: string;
    failed: string;
    success: string;
    name: string;
    category: string;
    city: string;
    branch: string;
    description: string;
    note: string;
    reason: string;
    date: string;
    time: string;
    amount: string;
    price: string;
    total: string;
    quantity: string;
    unit: string;
    status: string;
    required: string;
    optional: string;
    all: string;
    none: string;
    active: string;
    inactive: string;
    loading: string;
    saving: string;
    noResultsFound: string;
    somethingWentWrong: string;
    tryAgain: string;
    cash: string;
    card: string;
    yes: string;
    no: string;
    lightMode: string;
    darkMode: string;
    signIn: string;
    signOut: string;
    username: string;
    password: string;
    view: string;
    search: string;
    export: string;
    today: string;
    yesterday: string;
    last7Days: string;
    last30Days: string;
    lastMonth: string;
    customRange: string;
    thisWeek: string;
    thisMonth: string;
  };

  login: {
    title: string;
    username: string;
    password: string;
    signIn: string;
    signingIn: string;
    invalidCredentials: string;
    tooManyAttempts: string; // {n}
  };

  sidebar: {
    groupOperations: string;
    cashier: string;
    dailyNeeds: string;
    menu: string;
    groupInventory: string;
    warehouse: string;
    ingredientUsage: string;
    production: string;
    estimatedProfit: string;
    groupFinance: string;
    sales: string;
    expenses: string;
    profit: string;
    cashTracking: string;
    groupAdmin: string;
    events: string;
    staff: string;
    roles: string;
    reports: string;
    signOut: string;
    languageToggle: string;
  };

  cashier: {
    header: string;
    sync: string;
    offline: string;
    syncPendingTooltip: string;
    offlineTooltip: string;
    branchExampleLabel: string; // e.g. "Sulaymaniyah — Branch 1"
    tagToEvent: string;
    noEvent: string;
    attentionBanner: string; // {n}
    pagerClashBanner: string;
    noItemsHere: string;
    addItemsHint: string;
    currentOrder: string;
    clear: string;
    walkIn: string;
    delivery: string;
    tapItemsToAdd: string;
    driverRefLabel: string;
    driverRefPlaceholder: string;
    paymentByPlatform: string;
    pagerNumber: string;
    paymentMethod: string;
    total: string;
    placing: string;
    placeDeliveryOrder: string;
    placeOrder: string;
    viewCartMobile: string; // {n}, {price}
    chooseOptions: string;
    addToOrder: string;
    pagerTakenMessage: string; // {n}
    noFreePagers: string;
    pagerOption: string; // {n}
    resend: string;
    discardOrder: string;
    activeOrders: string;
    activeCount: string; // {n}
    noActiveOrders: string;
    needsAttention: string;
    pendingSync: string;
    cancelOrderTooltip: string;
    provisionalTotalTooltip: string;
    markAsReady: string;
    collectedFreePager: string;
    deliveryLabel: string;
    prepLabel: string;
    readyToDriverLabel: string;
    ready: string;
    driverArrived: string;
    collected: string;
    cartEmpty: string;
    selectPager: string;
    savedOffline: string; // {n}
    orderPlaced: string; // {n}
    deliveryOrderPlaced: string;
    failedToPlaceOrder: string;
    pagerReadyWillSync: string; // {n}
    pagerReady: string; // {n}
    pagerFreedWillSync: string; // {n}
    pagerFreed: string; // {n}
    confirmCancelOrder: string;
    orderCancelledWillSync: string;
    orderCancelledPagerFreed: string;
    deliveryOrderReady: string;
    orderCollected: string;
  };

  dailyNeeds: {
    header: string;
    checklistFor: string; // {date}
    saveAsImage: string;
    saveChecklist: string;
    checklistSaved: string;
    noItemsYet: string;
  };

  menu: {
    header: string;
    addCategory: string;
    addItem: string;
    itemsCount: string; // {n}
    renameCategory: string;
    deleteCategory: string;
    confirmDeleteCategory: string;
    itemName: string;
    price: string;
    descriptionOptional: string;
    imageOptional: string;
    available: string;
    hiddenFromCashier: string;
    modifiers: string;
    addOptionGroup: string;
    optionGroupNamePlaceholder: string;
    required: string;
    addOption: string;
    optionName: string;
    extraPriceOptional: string;
    categorySaved: string;
    itemSaved: string;
    itemDeleted: string;
    confirmDeleteItem: string;
    perCityPricing: string;
    perCityAvailability: string;
  };

  warehouse: {
    header: string;
    addItem: string;
    addCategory: string;
    lowStock: string;
    inStock: string;
    minimumThreshold: string;
    unitCost: string;
    lowStockBadge: string;
    addStock: string;
    removeStock: string;
    amount: string;
    totalDeliveryCost: string;
    unitCostAuto: string;
    reason: string;
    reasonDailyUsage: string;
    reasonWastage: string;
    reasonManualCorrection: string;
    reasonOther: string;
    noteRequiredForOther: string;
    assignToEventOptional: string;
    stockMovements: string;
    added: string;
    removed: string;
    editedBadge: string;
    editMovement: string;
    deleteMovement: string;
    confirmDeleteMovement: string;
    inventoryCategories: string;
    categoryName: string;
    color: string;
    uncategorized: string;
    itemSaved: string;
    itemDeleted: string;
    stockUpdated: string;
    movementUpdated: string;
    movementDeleted: string;
  };

  ingredientUsage: {
    header: string;
    rangeLabel: string; // {from}, {to}
    ingredient: string;
    theoreticalUsage: string;
    actualUsage: string;
    wastage: string;
    wastagePct: string;
    perItemBreakdown: string;
    emptyState: string;
  };

  production: {
    tabRecipes: string;
    tabBatches: string;
    tabDispatch: string;
    recipeFor: string; // {itemName}
    addIngredientLine: string;
    ingredient: string;
    amountPerServing: string;
    costSource: string;
    fromWarehouseItem: string;
    fromBatch: string;
    manualCost: string;
    grossProfit: string;
    grossProfitPct: string;
    notesOptional: string;
    batchName: string;
    totalBatchAmount: string;
    costPerUnit: string;
    ingredients: string;
    makeABatch: string;
    makeBatchConfirm: string; // {n}
    dispatchToLocation: string;
    batch: string;
    quantity: string;
    location: string;
    sulaymaniyah: string;
    erbil: string;
    send: string;
    recipeSaved: string;
    recipeDeleted: string;
    batchSaved: string;
    batchMade: string;
    dispatchedSuccessfully: string;
  };

  estimatedProfit: {
    header: string;
    disclaimer: string;
    estimatedRevenue: string;
    estimatedIngredientCost: string;
    estimatedGrossProfit: string;
    estimatedMargin: string;
  };

  expenses: {
    header: string;
    addExpense: string;
    total: string;
    categoryRent: string;
    categoryUtilities: string;
    categorySupplies: string;
    categoryStaff: string;
    categoryOther: string;
    dateRange: string;
    assignedEvent: string;
    amount: string;
    category: string;
    descriptionOptional: string;
    date: string;
    expenseSaved: string;
    expenseUpdated: string;
    expenseDeleted: string;
    confirmDeleteExpense: string;
  };

  events: {
    header: string;
    createEvent: string;
    active: string;
    closed: string;
    eventName: string;
    startDate: string;
    endDateOptional: string;
    locationOptional: string;
    view: string;
    closeEvent: string;
    confirmCloseEvent: string;
    evaluationHeader: string;
    revenue: string;
    usageCost: string;
    taggedExpenses: string;
    grossProfit: string;
    grossLoss: string;
    topItems: string;
    verdictProfitable: string;
    verdictLoss: string;
  };

  sales: {
    header: string;
    exportCsv: string;
    totalOrders: string;
    totalRevenue: string;
    averageOrderValue: string;
    busiestHour: string;
    averagePrepTime: string;
    slowestOrder: string;
    revenueByDay: string;
    topSellingItems: string;
    ordersByHour: string;
    paymentMethodSplit: string;
    order: string;
    pager: string;
    items: string;
    total: string;
    payment: string;
    status: string;
    placedAt: string;
    readyAt: string;
    searchOrders: string;
    deleteOrder: string;
    confirmDeleteOrder: string;
    expectedCashOnHand: string;
    expectedCashFormula: string;
  };

  profit: {
    header: string;
    totalSales: string;
    totalExpenses: string;
    ingredientBatchCost: string;
    grossProfit: string;
    grossMargin: string;
  };

  cashTracking: {
    header: string;
    managerHolds: string;
    safeBalance: string;
    moveCashToSafe: string;
    amount: string;
    date: string;
    noteOptional: string;
    recordWithdrawal: string;
    source: string;
    safe: string;
    manager: string;
    recipient: string;
    exceedsBalance: string;
    safeDeposits: string;
    withdrawals: string;
    withdrawalTotalsByPerson: string;
    deleteEntry: string;
    confirmDeleteEntry: string;
  };

  staff: {
    header: string;
    addStaffMember: string;
    totalPayroll: string;
    fullName: string;
    username: string;
    password: string;
    role: string;
    roleAdmin: string;
    roleManager: string;
    roleCashier: string;
    assignedCity: string;
    assignedBranch: string;
    branchExample1: string;
    branchExample2: string;
    branchExampleErbil: string;
    monthlySalary: string;
    active: string;
    deactivateAccount: string;
    resetPassword: string;
    tableName: string;
    tableUsername: string;
    tableRole: string;
    tableCityBranch: string;
    tableStatus: string;
    tableLastLogin: string;
    tableDateAdded: string;
    staffSaved: string;
    passwordReset: string; // {password}
    staffDeactivated: string;
    businessHours: string;
    openingHour: string;
    closingHour: string;
    businessHoursHint: string;
  };

  roles: {
    header: string;
    permission: string;
    admin: string;
    manager: string;
    cashier: string;
    recentActivity: string;
    activityLine: string; // {staffName}, {action}
    noActivityYet: string;
  };

  reports: {
    header: string;
    selectMonth: string;
    downloadReport: string;
    generatingReport: string;
  };
}
