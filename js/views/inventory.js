// المخزون والأصناف — إدارة بيانات الفئات والأقسام والأصناف والكميات
// يتيح عرض المخزون بشكل هرمي منظم حسب الفئة مع مؤشرات مرئية لكل قسم، وإحصائيات متقدمة
import { $, $$, esc, fmt, uid } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm } from '../components.js';
import { can, currentUser } from './users.js';

export function render(container, params, state) {
  const me = currentUser();
  let items = store.list('items').filter(item => item.archived !== true);
  const canManage = can(me, 'manage_inventory');
  let activeCategory = params.category || 'all';
  let viewMode = 'hierarchy'; // 'hierarchy' | 'table'
  let collapsedCats = new Set();

  function getCategories() {
    return store.list('categories');
  }

  container.innerHTML = `
    <div class="view-head">
      <div>
        <div class="view-title">المخزون والأصناف 📦</div>
        <small>تنظيم الأصناف هرمياً حسب الفئات مع متابعة المخزون والأسعار ومؤشرات الحالة</small>
      </div>
      <div class="view-actions">
        ${canManage ? `
          <button class="btn ghost" id="inv-manage-cats" title="إدارة وتخصيص أقسام وفئات المخزون">🏷️ إدارة الفئات</button>
          <button class="btn primary" data-add-item>＋ إضافة صنف</button>
        ` : ''}
      </div>
    </div>

    ${!canManage ? '<div class="alert info"><span class="a-ic">🔒</span><div>لديك صلاحية العرض فقط. تعديل الأصناف متاح للمستخدم المخوّل.</div></div>' : ''}

    <!-- مؤشرات وإحصائيات المخزون العلوية -->
    <div class="inv-stats-grid" id="inv-stats-box"></div>

    <!-- شريط تصفية الفئات السريع -->
    <div class="pos-filter-tags" id="inv-categories-bar" style="margin-bottom:12px"></div>

    <!-- شريط الأدوات والبحث والتبديل -->
    <div class="toolbar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div class="search-input" style="flex:1;min-width:220px">
        <input id="inventory-q" placeholder="بحث باسم الصنف، الفئة، أو الوحدة...">
        <span class="s-ic">🔍</span>
      </div>
      <select class="select" id="inventory-cat-select" style="max-width:180px"><option value="">كل الفئات</option></select>
      <select class="select" id="inventory-stock" style="max-width:180px">
        <option value="">كل حالات المخزون</option>
        <option value="low">تحت حد التنبيه ⚠️</option>
        <option value="ok">الكمية كافية ✅</option>
        <option value="out">نفد من المخزون ❌</option>
      </select>
      
      <div class="inv-view-switch" title="نمط العرض">
        <button type="button" class="inv-view-btn active" id="btn-view-hierarchy">📑 هرمي (حسب الفئة)</button>
        <button type="button" class="inv-view-btn" id="btn-view-table">📊 جدول شامل</button>
      </div>

      <button type="button" class="btn ghost sm" id="inv-toggle-all-collapse" title="طي وتوسيع كل الأقسام" style="white-space:nowrap">⯆ طي/توسيع الكل</button>
    </div>

    <div id="inventory-list"></div>
    <div class="empty" id="inventory-empty" hidden>
      <div class="e-ic">📦</div>
      <h3>لا توجد أصناف مطابقة</h3>
      <p class="muted">أضف أصنافك وصنفها حسب الأقسام لتظهر في نقطة البيع والعمليات.</p>
    </div>
  `;

  function renderStats() {
    const statsBox = $('#inv-stats-box', container);
    if (!statsBox) return;

    const cats = getCategories();
    let totalBuyVal = 0;
    let totalSellVal = 0;
    let lowCount = 0;
    let outCount = 0;

    items.forEach(i => {
      const q = Number(i.quantity || 0);
      const buy = Number(i.buyPrice || 0);
      const sell = Number(i.sellPrice || 0);
      const alert = Number(i.alertQty || 0);

      totalBuyVal += q * buy;
      totalSellVal += q * sell;
      if (q <= 0) outCount++;
      else if (q <= alert) lowCount++;
    });

    statsBox.innerHTML = `
      <div class="inv-stat-card">
        <div class="inv-stat-icon" style="background:var(--primary-soft);color:var(--primary)">📦</div>
        <div>
          <div class="inv-stat-val">${fmt(items.length, 0)}</div>
          <div class="inv-stat-lbl">إجمالي الأصناف المسجلة</div>
        </div>
      </div>
      <div class="inv-stat-card">
        <div class="inv-stat-icon" style="background:var(--surface2)">🏷️</div>
        <div>
          <div class="inv-stat-val">${fmt(cats.length, 0)}</div>
          <div class="inv-stat-lbl">الأقسام والفئات المعتمدة</div>
        </div>
      </div>
      <div class="inv-stat-card">
        <div class="inv-stat-icon" style="background:var(--success-soft);color:var(--success)">💰</div>
        <div>
          <div class="inv-stat-val">${fmt(totalBuyVal)}</div>
          <div class="inv-stat-lbl">قيمة المخزون (سعر التكلفة)</div>
        </div>
      </div>
      <div class="inv-stat-card">
        <div class="inv-stat-icon" style="background:${(lowCount + outCount) > 0 ? 'var(--warn-soft)' : 'var(--surface2)'};color:${(lowCount + outCount) > 0 ? 'var(--warn)' : 'var(--text-muted)'}">
          ${(lowCount + outCount) > 0 ? '⚠️' : '✅'}
        </div>
        <div>
          <div class="inv-stat-val" style="color:${(lowCount + outCount) > 0 ? 'var(--warn)' : 'inherit'}">
            ${lowCount + outCount > 0 ? `${outCount} نفد / ${lowCount} ناقص` : 'المخزون كافٍ'}
          </div>
          <div class="inv-stat-lbl">تنبيهات نقص المخزون</div>
        </div>
      </div>
    `;
  }

  function renderCategoryChips() {
    const cats = getCategories();
    const bar = $('#inv-categories-bar', container);
    const select = $('#inventory-cat-select', container);

    const totalCount = items.length;
    let chipsHtml = `
      <button class="pos-chip ${activeCategory === 'all' ? 'active' : ''}" data-inv-cat="all">
        🏷️ كل الأقسام (${totalCount})
      </button>
    `;

    cats.forEach(c => {
      const count = items.filter(i => i.categoryId === c.id).length;
      chipsHtml += `
        <button class="pos-chip ${activeCategory === c.id ? 'active' : ''}" data-inv-cat="${esc(c.id)}">
          ${c.icon ? esc(c.icon) + ' ' : '📁 '}${esc(c.name)} (${count})
        </button>
      `;
    });

    const uncatCount = items.filter(i => !i.categoryId).length;
    if (uncatCount > 0) {
      chipsHtml += `
        <button class="pos-chip ${activeCategory === 'uncategorized' ? 'active' : ''}" data-inv-cat="uncategorized">
          📁 بدون فئة (${uncatCount})
        </button>
      `;
    }

    if (canManage) {
      chipsHtml += `<button class="pos-chip ghost" id="inv-quick-add-cat" style="border-style:dashed">＋ قسم جديد</button>`;
    }

    bar.innerHTML = chipsHtml;

    // خيارات القائمة المنسدلة
    select.innerHTML = `
      <option value="" ${activeCategory === 'all' ? 'selected' : ''}>كل الفئات</option>
      ${cats.map(c => `<option value="${esc(c.id)}" ${activeCategory === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      ${uncatCount > 0 ? `<option value="uncategorized" ${activeCategory === 'uncategorized' ? 'selected' : ''}>بدون فئة</option>` : ''}
    `;

    // ربط نقرات الفئات
    $$('[data-inv-cat]', bar).forEach(btn => {
      btn.onclick = () => {
        activeCategory = btn.dataset.invCat;
        renderCategoryChips();
        apply();
      };
    });

    const quickAdd = $('#inv-quick-add-cat', bar);
    if (quickAdd) {
      quickAdd.onclick = () => openCategoryModal(() => {
        renderCategoryChips();
        renderStats();
        apply();
      });
    }
  }

  function apply() {
    const q = ($('#inventory-q', container).value || '').trim().toLowerCase();
    const stockFilter = $('#inventory-stock', container).value;
    const cats = getCategories();
    const catMap = Object.fromEntries(cats.map(c => [c.id, c]));

    // تصفية الأصناف الإجمالية
    const filteredItems = items.filter(item => {
      const cat = item.categoryId ? catMap[item.categoryId] : null;
      const catName = cat ? cat.name : '';
      if (q && !(`${item.name || ''} ${item.unit || ''} ${item.notes || ''} ${catName}`).toLowerCase().includes(q)) return false;

      // تصفية الفئة
      if (activeCategory !== 'all') {
        if (activeCategory === 'uncategorized' && item.categoryId) return false;
        if (activeCategory !== 'uncategorized' && item.categoryId !== activeCategory) return false;
      }

      // تصفية المخزون
      const qty = Number(item.quantity || 0);
      const alertQty = Number(item.alertQty || 0);
      if (stockFilter === 'low' && (qty <= 0 || qty > alertQty)) return false;
      if (stockFilter === 'ok' && qty <= alertQty) return false;
      if (stockFilter === 'out' && qty > 0) return false;

      return true;
    });

    const box = $('#inventory-list', container);
    $('#inventory-empty', container).hidden = !!filteredItems.length;
    if (!filteredItems.length) { box.innerHTML = ''; return; }

    if (viewMode === 'table') {
      renderFlatTable(box, filteredItems, catMap);
    } else {
      renderHierarchicalView(box, filteredItems, cats, catMap);
    }
  }

  // 1. العرض الهرمي المنظم حسب الأقسام مع مؤشرات بصرية
  function renderHierarchicalView(box, filteredList, allCats, catMap) {
    // تجميع الأصناف داخل كل فئة
    const groups = [];

    // الفئات المعتمدة
    allCats.forEach(cat => {
      if (activeCategory !== 'all' && activeCategory !== cat.id) return;
      const groupItems = filteredList.filter(i => i.categoryId === cat.id);
      // إذا كان هناك بحث أو فلتر، نظهر الفئة فقط إذا احتوت على أصناف، وإلا نظهرها إذا تم النقر عليها
      if (groupItems.length > 0 || (activeCategory === cat.id && !$('#inventory-q', container).value.trim())) {
        groups.push({
          id: cat.id,
          name: cat.name,
          icon: cat.icon || '📁',
          isUncategorized: false,
          items: groupItems,
        });
      }
    });

    // قسم الأصناف غير المصنفة
    const uncatItems = filteredList.filter(i => !i.categoryId);
    if (uncatItems.length > 0 && (activeCategory === 'all' || activeCategory === 'uncategorized')) {
      groups.push({
        id: 'uncategorized',
        name: 'أصناف عامة (بدون قسم)',
        icon: '📁',
        isUncategorized: true,
        items: uncatItems,
      });
    }

    if (!groups.length) {
      box.innerHTML = '';
      $('#inventory-empty', container).hidden = false;
      return;
    }

    box.innerHTML = `
      <div class="inv-hierarchy-container">
        ${groups.map(group => renderCategoryCard(group)).join('')}
      </div>
    `;

    // ربط طي وتوسيع الكروت
    $$('.inv-cat-header', box).forEach(hdr => {
      hdr.onclick = (e) => {
        if (e.target.closest('button')) return; // تجاهل أزرار الإجراءات
        const card = hdr.closest('.inv-category-card');
        const catId = card.dataset.catCard;
        if (card.classList.contains('is-collapsed')) {
          card.classList.remove('is-collapsed');
          collapsedCats.delete(catId);
        } else {
          card.classList.add('is-collapsed');
          collapsedCats.add(catId);
        }
      };
    });
  }

  function renderCategoryCard(group) {
    const isCollapsed = collapsedCats.has(group.id);
    let totalCatBuyVal = 0;
    let totalCatSellVal = 0;
    let lowCount = 0;
    let outCount = 0;

    group.items.forEach(i => {
      const q = Number(i.quantity || 0);
      const alert = Number(i.alertQty || 0);
      totalCatBuyVal += q * Number(i.buyPrice || 0);
      totalCatSellVal += q * Number(i.sellPrice || 0);
      if (q <= 0) outCount++;
      else if (q <= alert) lowCount++;
    });

    // تحديد المؤشر البصري للحالة العامة للقسم
    let healthIndicator = `<span class="inv-indicator-pill ok">✅ مكتمل وسليم</span>`;
    if (outCount > 0) {
      healthIndicator = `<span class="inv-indicator-pill danger">❌ ${outCount} صنف نفد</span>`;
    } else if (lowCount > 0) {
      healthIndicator = `<span class="inv-indicator-pill warn">⚠️ ${lowCount} تحت التنبيه</span>`;
    } else if (group.items.length === 0) {
      healthIndicator = `<span class="inv-indicator-pill neutral">فارغ</span>`;
    }

    return `
      <div class="inv-category-card ${isCollapsed ? 'is-collapsed' : ''}" data-cat-card="${esc(group.id)}">
        <div class="inv-cat-header">
          <div class="inv-cat-title-wrap">
            <div class="inv-cat-icon-badge">${esc(group.icon)}</div>
            <div>
              <div class="inv-cat-name">${esc(group.name)}</div>
              <div class="muted" style="font-size:11.5px">
                ${group.items.length} صنف | إجمالي التكلفة: <b>${fmt(totalCatBuyVal)}</b>
              </div>
            </div>
          </div>

          <div class="inv-cat-meta">
            <div class="inv-cat-indicators">
              ${healthIndicator}
              <span class="inv-indicator-pill neutral">قيمة البيع: ${fmt(totalCatSellVal)}</span>
            </div>

            <div class="inv-cat-actions">
              ${canManage && !group.isUncategorized ? `
                <button type="button" class="btn ghost sm" data-add-to-cat="${esc(group.id)}" title="إضافة صنف لهذا القسم">
                  ＋ صنف للقسم
                </button>
              ` : ''}
              <span class="inv-cat-toggle-icon">▼</span>
            </div>
          </div>
        </div>

        <div class="inv-cat-body">
          ${group.items.length > 0 ? `
            <div class="table-wrap">
              <table class="tbl" style="margin:0">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>الوحدة</th>
                    <th>سعر الشراء (التكلفة)</th>
                    <th>سعر البيع</th>
                    <th>هامش الربح</th>
                    <th>الكمية وحالة المخزون</th>
                    <th>حد التنبيه</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${group.items.map(item => itemHierarchyRow(item)).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="inv-cat-empty">
              <p style="margin-bottom:8px">لا توجد أصناف مسجلة في هذا القسم بعد.</p>
              ${canManage ? `<button type="button" class="btn primary sm" data-add-to-cat="${esc(group.id)}">＋ إضافة أول صنف في ${esc(group.name)}</button>` : ''}
            </div>
          `}
        </div>
      </div>
    `;
  }

  function itemHierarchyRow(item) {
    const qty = Number(item.quantity || 0);
    const alertQty = Number(item.alertQty || 0);
    const buy = Number(item.buyPrice || 0);
    const sell = Number(item.sellPrice || 0);
    const isOut = qty <= 0;
    const isLow = qty <= alertQty && !isOut;

    // احتساب هامش الربح
    let marginHtml = '<span class="muted">—</span>';
    if (buy > 0 && sell > 0) {
      const profit = sell - buy;
      const profitPercent = ((profit / buy) * 100).toFixed(0);
      marginHtml = `<span style="font-size:12px;font-weight:700;color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">
        ${profit >= 0 ? '+' : ''}${fmt(profit)} (${profitPercent}%)
      </span>`;
    }

    // شريط ومؤشر المخزون المرئي
    const maxReference = Math.max(alertQty * 3, qty, 10);
    const percent = Math.min(100, Math.max(0, (qty / maxReference) * 100));
    let progressClass = '';
    let stockBadge = `<span class="pill green">${fmt(qty, quantityDecimals(qty))} ${esc(item.unit || '')}</span>`;

    if (isOut) {
      progressClass = 'danger';
      stockBadge = `<span class="pill red">نفد (0)</span>`;
    } else if (isLow) {
      progressClass = 'warn';
      stockBadge = `<span class="pill warn">⚠️ ${fmt(qty, quantityDecimals(qty))} ${esc(item.unit || '')}</span>`;
    }

    return `
      <tr>
        <td>
          <div style="font-weight:700;font-size:13.5px">${esc(item.name)}</div>
          ${item.notes ? `<div class="muted" style="font-size:11px;margin-top:2px">${esc(item.notes)}</div>` : ''}
        </td>
        <td><span class="pill">${esc(item.unit || 'حبة')}</span></td>
        <td>${fmt(buy)}</td>
        <td><b>${fmt(sell)}</b></td>
        <td>${marginHtml}</td>
        <td>
          <div class="inv-stock-meter">
            <div>${stockBadge}</div>
            <div class="inv-stock-bar">
              <div class="inv-stock-progress ${progressClass}" style="width:${percent}%"></div>
            </div>
          </div>
        </td>
        <td><span class="muted" style="font-size:12px">${fmt(alertQty, quantityDecimals(alertQty))}</span></td>
        <td style="white-space:nowrap;text-align:left">
          ${canManage ? `
            <button class="btn sm ghost" data-edit-item="${esc(item.id)}" title="تعديل بيانات الصنف">✏️ تعديل</button>
            <button class="btn sm ghost" data-del-item="${esc(item.id)}" style="color:var(--danger)" title="حذف الصنف">🗑️</button>
          ` : '—'}
        </td>
      </tr>
    `;
  }

  // 2. العرض كجدول شامل مسطح
  function renderFlatTable(box, list, catMap) {
    box.innerHTML = `
      <div class="table-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>الصنف</th>
              <th>الفئة / القسم</th>
              <th>الوحدة</th>
              <th>سعر الشراء</th>
              <th>سعر البيع</th>
              <th>الكمية</th>
              <th>حد التنبيه</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map(item => itemFlatRow(item, catMap[item.categoryId])).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function itemFlatRow(item, cat) {
    const qty = Number(item.quantity || 0);
    const alertQty = Number(item.alertQty || 0);
    const isOut = qty <= 0;
    const isLow = qty <= alertQty && !isOut;

    let stockPill = `<span class="pill green">${fmt(qty, quantityDecimals(qty))}</span>`;
    if (isOut) stockPill = `<span class="pill red">نفد (0)</span>`;
    else if (isLow) stockPill = `<span class="pill warn">⚠️ ${fmt(qty, quantityDecimals(qty))}</span>`;

    return `<tr>
      <td>
        <b>${esc(item.name)}</b>
        ${item.notes ? `<div class="muted" style="font-size:11px">${esc(item.notes)}</div>` : ''}
      </td>
      <td>
        ${cat ? `<span class="pill">${cat.icon ? esc(cat.icon) + ' ' : '📁 '}${esc(cat.name)}</span>` : '<span class="muted" style="font-size:12px">—</span>'}
      </td>
      <td>${esc(item.unit || 'حبة')}</td>
      <td>${fmt(item.buyPrice || 0)}</td>
      <td><b>${fmt(item.sellPrice || 0)}</b></td>
      <td>${stockPill}</td>
      <td>${fmt(alertQty, quantityDecimals(alertQty))}</td>
      <td style="white-space:nowrap">
        ${canManage ? `
          <button class="btn sm ghost" data-edit-item="${esc(item.id)}" title="تعديل بيانات الصنف">✏️ تعديل</button>
          <button class="btn sm ghost" data-del-item="${esc(item.id)}" style="color:var(--danger)" title="حذف الصنف">🗑️ حذف</button>
        ` : '—'}
      </td>
    </tr>`;
  }

  // أحداث البحث والتصفية
  $('#inventory-q', container).addEventListener('input', apply);
  $('#inventory-stock', container).addEventListener('change', apply);
  $('#inventory-cat-select', container).addEventListener('change', (e) => {
    activeCategory = e.target.value || 'all';
    renderCategoryChips();
    apply();
  });

  // تبديل نمط العرض (هرمي / جدول)
  const btnHierarchy = $('#btn-view-hierarchy', container);
  const btnTable = $('#btn-view-table', container);
  if (btnHierarchy && btnTable) {
    btnHierarchy.onclick = () => {
      viewMode = 'hierarchy';
      btnHierarchy.classList.add('active');
      btnTable.classList.remove('active');
      apply();
    };
    btnTable.onclick = () => {
      viewMode = 'table';
      btnTable.classList.add('active');
      btnHierarchy.classList.remove('active');
      apply();
    };
  }

  // زر طي وتوسيع الكل
  const btnToggleAll = $('#inv-toggle-all-collapse', container);
  if (btnToggleAll) {
    let allCollapsed = false;
    btnToggleAll.onclick = () => {
      allCollapsed = !allCollapsed;
      const cats = getCategories();
      if (allCollapsed) {
        cats.forEach(c => collapsedCats.add(c.id));
        collapsedCats.add('uncategorized');
      } else {
        collapsedCats.clear();
      }
      apply();
    };
  }

  // زر إدارة الفئات
  const manageCatsBtn = $('#inv-manage-cats', container);
  if (manageCatsBtn) {
    manageCatsBtn.onclick = () => openCategoryManagerModal(() => {
      renderCategoryChips();
      renderStats();
      apply();
    });
  }

  // الاستماع للأزرار التفاعلية
  container.addEventListener('click', (event) => {
    // إضافة صنف عام
    const add = event.target.closest('[data-add-item]');
    if (add && canManage) {
      const defaultCatId = (activeCategory !== 'all' && activeCategory !== 'uncategorized') ? activeCategory : '';
      itemForm({ categoryId: defaultCatId }, () => {
        items = store.list('items').filter(item => item.archived !== true);
        renderStats();
        renderCategoryChips();
        apply();
      });
      return;
    }

    // إضافة صنف لقسم محدد مباشرة
    const addToCat = event.target.closest('[data-add-to-cat]');
    if (addToCat && canManage) {
      const targetCatId = addToCat.dataset.addToCat;
      itemForm({ categoryId: targetCatId }, () => {
        items = store.list('items').filter(item => item.archived !== true);
        renderStats();
        renderCategoryChips();
        apply();
      });
      return;
    }

    // تعديل صنف
    const edit = event.target.closest('[data-edit-item]');
    if (edit && canManage) {
      itemForm(store.get('items', edit.dataset.editItem), () => {
        items = store.list('items').filter(item => item.archived !== true);
        renderStats();
        renderCategoryChips();
        apply();
      });
      return;
    }

    // حذف صنف
    const del = event.target.closest('[data-del-item]');
    if (del && canManage) {
      deleteItem(del.dataset.delItem, () => {
        items = store.list('items').filter(item => item.archived !== true);
        renderStats();
        renderCategoryChips();
        apply();
      });
    }
  });

  renderStats();
  renderCategoryChips();
  apply();
}

function quantityDecimals(value) {
  return Number.isInteger(Number(value)) ? 0 : 2;
}

// نافذة إضافة / تعديل صنف مع اختيار الفئة والقسم
function itemForm(existing, done) {
  const item = existing || {};
  const categories = store.list('categories');
  const catOptions = [
    { value: '', label: 'بدون فئة (عام)' },
    ...categories.map(c => ({ value: c.id, label: (c.icon ? c.icon + ' ' : '') + c.name }))
  ];

  const modal = openModal({
    title: item.id ? '✏️ تعديل بيانات الصنف' : '＋ إضافة صنف للمخزون',
    body: `<form id="item-form">
      ${field({ type: 'text', name: 'name', label: 'اسم الصنف', value: item.name || '', required: true })}
      
      <div class="field">
        <label>الفئة / القسم</label>
        <div style="display:flex;gap:8px;align-items:center">
          <select name="categoryId" id="item-form-cat" class="select" style="flex:1;padding:11px">
            ${catOptions.map(opt => `<option value="${esc(opt.value)}" ${(item.categoryId || '') === opt.value ? 'selected' : ''}>${esc(opt.label)}</option>`).join('')}
          </select>
          <button type="button" class="btn ghost sm" id="item-form-new-cat" title="إضافة فئة جديدة فوراً">＋ فئة</button>
        </div>
        <div class="hint">تصنيف الأصناف يسهل الوصول إليها في شاشة المبيعات ونقاط البيع.</div>
      </div>

      <div class="field-row">
        ${field({ type: 'text', name: 'unit', label: 'الوحدة (حبة/كرتون/كيلو)', value: item.unit || 'حبة' })}
        ${field({ type: 'number', name: 'quantity', label: 'الكمية الحالية بالمخزون', value: item.quantity ?? 0, required: true })}
      </div>
      <div class="field-row">
        ${field({ type: 'number', name: 'buyPrice', label: 'سعر الشراء (التكلفة)', value: item.buyPrice ?? 0 })}
        ${field({ type: 'number', name: 'sellPrice', label: 'سعر البيع الافتراضي', value: item.sellPrice ?? 0 })}
      </div>
      ${field({ type: 'number', name: 'alertQty', label: 'حد التنبيه (تنبيه نقص المخزون)', value: item.alertQty ?? 0, hint: 'يظهر تنبيه عندما تصبح الكمية مساوية أو أقل من هذا الحد.' })}
      ${field({ type: 'textarea', name: 'notes', label: 'ملاحظات / وصف الصنف', value: item.notes || '' })}
    </form>`,
    foot: '<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="item-save">💾 حفظ الصنف</button>',
  });

  const newCatBtn = $('#item-form-new-cat', modal.overlay);
  if (newCatBtn) {
    newCatBtn.onclick = () => {
      openCategoryModal((newCat) => {
        const catSelect = $('#item-form-cat', modal.overlay);
        if (catSelect && newCat) {
          const opt = document.createElement('option');
          opt.value = newCat.id;
          opt.textContent = (newCat.icon ? newCat.icon + ' ' : '') + newCat.name;
          opt.selected = true;
          catSelect.appendChild(opt);
        }
      });
    };
  }

  $('#item-save', modal.overlay).onclick = async () => {
    const data = readForm('#item-form', modal.overlay);
    const quantity = Number(data.quantity);
    const buyPrice = Number(data.buyPrice || 0);
    const sellPrice = Number(data.sellPrice || 0);
    const alertQty = Number(data.alertQty || 0);
    if (!String(data.name || '').trim()) { toastErr('أدخل اسم الصنف'); return; }
    if (![quantity, buyPrice, sellPrice, alertQty].every(Number.isFinite) || quantity < 0 || buyPrice < 0 || sellPrice < 0 || alertQty < 0) {
      toastErr('تحقق من صحة الكمية والأسعار وحد التنبيه');
      return;
    }
    await store.save('items', {
      id: item.id || uid('item'),
      name: String(data.name).trim(),
      categoryId: data.categoryId || '',
      unit: String(data.unit || 'حبة').trim() || 'حبة',
      quantity,
      buyPrice,
      sellPrice,
      alertQty,
      notes: String(data.notes || '').trim(),
      archived: false,
      createdAt: item.createdAt || new Date().toISOString(),
    });
    toast(item.id ? 'تم تعديل بيانات الصنف ✅' : 'تمت إضافة الصنف للمخزون ✅');
    modal.close();
    if (done) done();
  };
}

// نافذة إدارة الفئات والأقسام
function openCategoryManagerModal(onDone) {
  function renderContent(overlay) {
    const cats = store.list('categories');
    const items = store.list('items').filter(i => !i.archived);

    const listContainer = $('#cat-manager-list', overlay);
    if (!listContainer) return;

    if (!cats.length) {
      listContainer.innerHTML = '<div class="muted" style="text-align:center;padding:16px">لا توجد فئات حالياً. اضغط على الزر أدناه لإضافة أول فئة.</div>';
      return;
    }

    listContainer.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto">
        ${cats.map(c => {
          const count = items.filter(i => i.categoryId === c.id).length;
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:18px">${esc(c.icon || '📁')}</span>
                <div>
                  <strong style="font-size:14px">${esc(c.name)}</strong>
                  <div class="muted" style="font-size:11.5px">${count} صنف مرتبط</div>
                </div>
              </div>
              <div style="display:flex;gap:6px">
                <button type="button" class="icon-btn sm" data-edit-cat="${esc(c.id)}" title="تعديل الفئة">✏️</button>
                <button type="button" class="icon-btn sm" data-del-cat="${esc(c.id)}" style="color:var(--danger)" title="حذف الفئة">🗑️</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    $$('[data-edit-cat]', overlay).forEach(btn => {
      btn.onclick = () => {
        const cat = store.get('categories', btn.dataset.editCat);
        if (cat) {
          openCategoryModal(() => renderContent(overlay), cat);
        }
      };
    });

    $$('[data-del-cat]', overlay).forEach(btn => {
      btn.onclick = async () => {
        const cat = store.get('categories', btn.dataset.delCat);
        if (!cat) return;
        const count = items.filter(i => i.categoryId === cat.id).length;
        const ok = await confirmDialog({
          title: 'حذف فئة',
          message: `هل أنت متأكد من حذف الفئة «${esc(cat.name)}»؟ ${count > 0 ? `(يوجد ${count} صنف مرتبط بهذه الفئة ستصبح بدون فئة)` : ''}`,
          danger: true,
          confirmText: 'حذف الفئة'
        });
        if (!ok) return;
        await store.remove('categories', cat.id);
        toast('تم حذف الفئة');
        renderContent(overlay);
        if (onDone) onDone();
      };
    });
  }

  const modal = openModal({
    title: '🏷️ إدارة أقسام وفئات المخزون',
    body: `
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
        <p class="muted" style="margin:0;font-size:13px">تساعدك الفئات على تنظيم المنتجات وترتيبها في نقاط البيع.</p>
        <button type="button" class="btn primary sm" id="cat-mgr-add-btn">＋ فئة جديدة</button>
      </div>
      <div id="cat-manager-list"></div>
    `,
    foot: '<button class="btn primary" data-close>تم</button>',
  });

  const addBtn = $('#cat-mgr-add-btn', modal.overlay);
  if (addBtn) {
    addBtn.onclick = () => {
      openCategoryModal(() => {
        renderContent(modal.overlay);
        if (onDone) onDone();
      });
    };
  }

  renderContent(modal.overlay);
}

// نافذة إنشاء / تعديل فئة واحدة
function openCategoryModal(onSaved, existing = null) {
  const cat = existing || {};
  const icons = ['📁', '🏷️', '📦', '🍔', '🥤', '👕', '📱', '💊', '🛠️', '🧴', '🍫', '📚', '⚡', '🛒'];

  const modal = openModal({
    title: cat.id ? '✏️ تعديل الفئة' : '＋ إضافة فئة / قسم جديد',
    body: `
      <form id="cat-form">
        ${field({ type: 'text', name: 'name', label: 'اسم الفئة / القسم', value: cat.name || '', required: true, hint: 'مثل: مشروبات، معلبات، إلكترونيات، ملابس...' })}
        <div class="field">
          <label>أيقونة الفئة</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px" id="cat-icon-picker">
            ${icons.map(ic => `
              <button type="button" class="btn sm ${(cat.icon || '📁') === ic ? 'primary' : 'ghost'}" data-pick-icon="${ic}" style="font-size:16px;padding:6px 10px">${ic}</button>
            `).join('')}
          </div>
          <input type="hidden" name="icon" id="cat-icon-input" value="${cat.icon || '📁'}">
        </div>
      </form>
    `,
    foot: '<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="cat-save-btn">💾 حفظ الفئة</button>',
  });

  const iconInput = $('#cat-icon-input', modal.overlay);
  $$('[data-pick-icon]', modal.overlay).forEach(b => {
    b.onclick = () => {
      $$('[data-pick-icon]', modal.overlay).forEach(other => {
        other.classList.remove('primary');
        other.classList.add('ghost');
      });
      b.classList.remove('ghost');
      b.classList.add('primary');
      iconInput.value = b.dataset.pickIcon;
    };
  });

  $('#cat-save-btn', modal.overlay).onclick = async () => {
    const data = readForm('#cat-form', modal.overlay);
    const name = String(data.name || '').trim();
    if (!name) { toastErr('أدخل اسم الفئة'); return; }

    const saved = await store.save('categories', {
      id: cat.id || uid('cat'),
      name,
      icon: data.icon || '📁',
      createdAt: cat.createdAt || new Date().toISOString(),
    });

    toast(cat.id ? 'تم تعديل الفئة ✅' : 'تمت إضافة الفئة بنجاح ✅');
    modal.close();
    if (onSaved) onSaved(saved);
  };
}

async function deleteItem(id, done) {
  const item = store.get('items', id);
  if (!item) return;
  const ok = await confirmDialog({ title: 'حذف صنف', message: `سيُحذف «${esc(item.name)}» من قائمة المخزون. تفاصيل الفواتير السابقة محفوظة كما هي. متابعة؟`, danger: true, confirmText: 'حذف' });
  if (!ok) return;
  await store.remove('items', id);
  toast('تم حذف الصنف');
  if (done) done();
}

