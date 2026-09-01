// نظام المبيعات ونقاط البيع (POS) — فواتير نقدية وآجلة وجزئية وربط فوري بالديون والمخزون
import { $, $$, esc, fmt, uid, todayISO, nowTime, printHTML, exportExcel, openWhatsApp } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm, numberToWords } from '../components.js';
import { ACCOUNT_KINDS, OP_TYPES, opEffect, accountBalance, balanceLabels } from '../accounting.js';
import { go } from '../app.js';
import { generateReceiptImage, shareTransactionReceipt, dispatchTransactionNotification } from './transactions.js';

let activeTab = 'sale'; // 'sale' | 'history'
let cart = []; // [{ id, itemId, name, unit, quantity, unitPrice, buyPrice }]
let selectedCustomerId = ''; // '' means cash customer
let paymentType = 'cash'; // 'cash' | 'credit' | 'partial' | 'bank'
let paidAmount = 0;
let discount = 0;
let discountType = 'amount'; // 'amount' | 'percent'
let invoiceNote = '';
let invoiceRef = '';

export function render(container, params, state) {
  if (params && params.tab) activeTab = params.tab;
  if (params && params.customerId) selectedCustomerId = params.customerId;

  const st = store.settings();
  const cur = store.currency(st.defaultCurrency || 'YER');
  const items = store.list('items').filter(x => x.archived !== true);
  const customers = store.accounts(true).filter(a => a.kind === 'customer' || a.kind === 'general');

  container.innerHTML = `
    <div class="view-head">
      <div>
        <div class="view-title">نظام المبيعات ونقاط البيع 🛒</div>
        <small>فواتير مبيعات نقدية وآجلة وجزئية • ربط فوري بالديون والمخزون وإصدار السندات</small>
      </div>
      <div class="view-actions">
        <div class="pos-tabs">
          <button class="tab ${activeTab === 'sale' ? 'active' : ''}" data-pos-tab="sale">🛍️ نقطة البيع</button>
          <button class="tab ${activeTab === 'history' ? 'active' : ''}" data-pos-tab="history">📋 سجل فواتير المبيعات</button>
        </div>
      </div>
    </div>

    <div id="pos-view-body"></div>
  `;

  const body = $('#pos-view-body', container);

  if (activeTab === 'sale') {
    renderPOSSale(body, cur, items, customers);
  } else {
    renderPOSHistory(body, cur);
  }

  $$('[data-pos-tab]', container).forEach(btn => {
    btn.onclick = () => {
      activeTab = btn.dataset.posTab;
      $$('[data-pos-tab]', container).forEach(b => b.classList.toggle('active', b === btn));
      if (activeTab === 'sale') {
        renderPOSSale(body, cur, store.list('items').filter(x => x.archived !== true), store.accounts(true));
      } else {
        renderPOSHistory(body, cur);
      }
    };
  });
}

// ======================== شاشة نقطة البيع (POS) ========================
function renderPOSSale(container, cur, items, customers) {
  container.innerHTML = `
    <div class="pos-layout">
      <!-- قسم الأصناف والمنتجات -->
      <div class="pos-products-pane">
        <div class="pos-toolbar">
          <div class="search-input" style="flex:1">
            <input id="pos-search" placeholder="ابحث عن صنف بالاسم أو الوحدة..." autocomplete="off">
            <span class="s-ic">🔍</span>
          </div>
          <button class="btn ghost sm" id="pos-add-custom-item" title="إضافة صنف مخصص غير مسجل">＋ صنف حر</button>
          <button class="btn ghost sm" id="pos-new-inventory-item" title="إضافة صنف جديد للمخزون">📦 إضافة للمخزون</button>
        </div>

        <div class="pos-filter-tags" id="pos-category-filter">
          <!-- تُملأ ديناميكياً من الفئات والأقسام المتاحة -->
        </div>

        <div class="pos-products-grid" id="pos-products-grid"></div>
        <div class="empty" id="pos-products-empty" hidden>
          <div class="e-ic">📦</div>
          <h3>لا توجد أصناف مطابقة</h3>
          <p class="muted">أضف أصنافاً للمخزون أو استخدم "صنف حر" لإضافة بند فوري.</p>
        </div>
      </div>

      <!-- قسم سلة الفاتورة والدفع -->
      <div class="pos-cart-pane">
        <!-- بيانات العميل -->
        <div class="pos-customer-box card">
          <div class="pos-box-head">
            <label class="pos-box-label">👤 العميل / الحساب</label>
            <button class="btn sm soft" id="pos-new-customer-btn">＋ عميل جديد</button>
          </div>
          <div class="pos-customer-select-wrap">
            <select class="select" id="pos-customer-select" style="width:100%">
              <option value="">🛒 عميل نقدي (كاش / بدون حساب)</option>
              ${customers.map(c => {
                const bal = store.balance(c.id);
                const balText = bal > 0 ? ` (عليه: ${fmt(bal)} ${store.currency(c.currency).symbol})` : bal < 0 ? ` (له: ${fmt(Math.abs(bal))} ${store.currency(c.currency).symbol})` : '';
                return `<option value="${esc(c.id)}" ${c.id === selectedCustomerId ? 'selected' : ''}>${ACCOUNT_KINDS[c.kind] ? ACCOUNT_KINDS[c.kind].icon : '👤'} ${esc(c.name)}${balText}</option>`;
              }).join('')}
            </select>
          </div>
          <div id="pos-customer-status" class="pos-customer-status"></div>
        </div>

        <!-- قائمة بنود الفاتورة -->
        <div class="pos-cart-items-box card">
          <div class="pos-box-head">
            <span class="pos-box-label">🛍️ بنود الفاتورة (<span id="pos-cart-count">0</span>)</span>
            <button class="btn sm ghost" id="pos-clear-cart" style="color:var(--danger)">🗑️ مسح السلة</button>
          </div>

          <div class="pos-cart-list" id="pos-cart-list"></div>

          <div class="pos-cart-empty" id="pos-cart-empty">
            <div style="font-size:36px;margin-bottom:8px">🛒</div>
            <div>السلة فارغة</div>
            <small class="muted">اختر من قائمة الأصناف لإضافتها للفاتورة</small>
          </div>
        </div>

        <!-- تفاصيل الحساب وطريقة الدفع -->
        <div class="pos-checkout-box card">
          <!-- ملخص الأسعار -->
          <div class="pos-summary-row">
            <span>المجموع الفرعي:</span>
            <strong id="pos-subtotal">0 ${esc(cur.symbol)}</strong>
          </div>

          <div class="pos-discount-row">
            <div class="pos-discount-inputs">
              <label>الخصم:</label>
              <input type="number" id="pos-discount-val" value="${discount || ''}" placeholder="0" min="0" step="any" style="width:80px;padding:4px 8px;border-radius:8px;border:1px solid var(--border)">
              <select id="pos-discount-type" style="padding:4px 6px;border-radius:8px;border:1px solid var(--border)">
                <option value="amount" ${discountType === 'amount' ? 'selected' : ''}>${esc(cur.symbol)}</option>
                <option value="percent" ${discountType === 'percent' ? 'selected' : ''}>%</option>
              </select>
            </div>
            <span id="pos-discount-val-display" class="muted">-0 ${esc(cur.symbol)}</span>
          </div>

          <div class="pos-summary-total">
            <span>الإجمالي الصافي:</span>
            <strong id="pos-grand-total">0 ${esc(cur.symbol)}</strong>
          </div>

          <!-- طريقة الدفع والتسوية للديون -->
          <div class="pos-payment-section">
            <label class="pos-section-label">طريقة الدفع ونوع الفاتورة:</label>
            <div class="pos-payment-methods">
              <label class="pos-pay-option ${paymentType === 'cash' ? 'active' : ''}">
                <input type="radio" name="pos_pay" value="cash" ${paymentType === 'cash' ? 'checked' : ''}>
                <span>💵 نقدي (كامل)</span>
              </label>
              <label class="pos-pay-option ${paymentType === 'credit' ? 'active' : ''}">
                <input type="radio" name="pos_pay" value="credit" ${paymentType === 'credit' ? 'checked' : ''}>
                <span>📝 آجل (دين كامل)</span>
              </label>
              <label class="pos-pay-option ${paymentType === 'partial' ? 'active' : ''}">
                <input type="radio" name="pos_pay" value="partial" ${paymentType === 'partial' ? 'checked' : ''}>
                <span>⚖️ دفع جزئي (نقد + دين)</span>
              </label>
              <label class="pos-pay-option ${paymentType === 'bank' ? 'active' : ''}">
                <input type="radio" name="pos_pay" value="bank" ${paymentType === 'bank' ? 'checked' : ''}>
                <span>💳 تحويل / شبكة</span>
              </label>
            </div>

            <!-- صندوق الدفع الجزئي المحسّن -->
            <div id="pos-partial-box" class="pos-partial-box ${paymentType === 'partial' ? '' : 'hidden'}" style="background:var(--surface2);border:1.5px solid var(--primary);border-radius:12px;padding:12px;margin-top:10px">
              <div style="font-size:13px;font-weight:bold;color:var(--primary);margin-bottom:8px">⚖️ تفاصيل الدفع الجزئي (نقد + تقييد المتبقي كدين):</div>
              <div class="field-row" style="margin-bottom:8px">
                <div class="field" style="margin-bottom:0">
                  <label style="font-weight:700">💵 المبلغ المدفوع نقداً الآن:</label>
                  <input type="number" id="pos-paid-amount" value="${paidAmount || ''}" placeholder="أدخل المبلغ المقبوض نقداً" min="0" step="any" style="font-size:16px;font-weight:bold;color:var(--success);border:1.5px solid var(--border)">
                </div>
                <div class="field" style="margin-bottom:0">
                  <label style="font-weight:700">📝 المتبقي كدين على العميل:</label>
                  <div class="pos-remaining-badge" id="pos-remaining-debt" style="font-size:16px;font-weight:bold;color:var(--danger);padding:8px 12px;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;text-align:center">0 ${esc(cur.symbol)}</div>
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                <span class="muted" style="font-size:12px">نسب سريعة:</span>
                <button type="button" class="btn sm ghost" data-pos-pchip="0.25">25%</button>
                <button type="button" class="btn sm ghost" data-pos-pchip="0.50">50%</button>
                <button type="button" class="btn sm ghost" data-pos-pchip="0.75">75%</button>
                <button type="button" class="btn sm ghost" data-pos-pchip="clear">مسح</button>
              </div>
            </div>

            <!-- معلومات إضافية -->
            <div class="pos-extra-meta">
              <div class="field-row" style="margin-top:8px;gap:8px">
                <div class="field" style="flex:1;margin-bottom:0">
                  <input type="text" id="pos-ref" placeholder="رقم المرجع / الفاتورة" value="${invoiceRef || generateInvoiceRef()}" style="padding:7px 10px;font-size:12px">
                </div>
                <div class="field" style="flex:1.5;margin-bottom:0">
                  <input type="text" id="pos-note" placeholder="ملاحظات / بيان الفاتورة..." value="${invoiceNote || ''}" style="padding:7px 10px;font-size:12px">
                </div>
              </div>
            </div>
          </div>

          <!-- أزرار الإجراءات -->
          <div class="pos-action-buttons">
            <button class="btn primary big block" id="pos-submit-btn">
              <span>💾 إتمام وحفظ الفاتورة</span>
            </button>
            <div class="pos-sub-actions">
              <button class="btn ghost sm" id="pos-save-print-btn" title="حفظ وطباعة الفاتورة">🖨️ حفظ وطباعة</button>
              <button class="btn success sm" id="pos-save-wa-btn" title="حفظ ومشاركة عبر واتساب">🟢 مشاركة واتساب</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // منطق عرض الأصناف وتصفيتها
  let activeFilter = 'all';
  function renderCategoryFilters() {
    const cats = store.list('categories');
    const currentItems = store.list('items').filter(x => x.archived !== true);
    const filterBox = $('#pos-category-filter', container);

    let html = `
      <button class="pos-chip ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">🏷️ الكل (${currentItems.length})</button>
      <button class="pos-chip ${activeFilter === 'in-stock' ? 'active' : ''}" data-filter="in-stock">متوفر بالمخزون</button>
      <button class="pos-chip ${activeFilter === 'low-stock' ? 'active' : ''}" data-filter="low-stock">تحت التنبيه ⚠️</button>
    `;

    cats.forEach(c => {
      const count = currentItems.filter(i => i.categoryId === c.id).length;
      html += `
        <button class="pos-chip ${activeFilter === ('cat:' + c.id) ? 'active' : ''}" data-filter="cat:${esc(c.id)}">
          ${c.icon ? esc(c.icon) + ' ' : '📁 '}${esc(c.name)} (${count})
        </button>
      `;
    });

    filterBox.innerHTML = html;

    $$('#pos-category-filter button', container).forEach(btn => {
      btn.onclick = () => {
        activeFilter = btn.dataset.filter;
        renderCategoryFilters();
        renderProducts();
      };
    });
  }

  function renderProducts() {
    const q = ($('#pos-search', container).value || '').trim().toLowerCase();
    const grid = $('#pos-products-grid', container);
    const empty = $('#pos-products-empty', container);

    const currentItems = store.list('items').filter(x => x.archived !== true);
    const filtered = currentItems.filter(item => {
      if (q && !(item.name + ' ' + (item.unit || '') + ' ' + (item.notes || '')).toLowerCase().includes(q)) return false;
      const qty = Number(item.quantity || 0);
      const alertQty = Number(item.alertQty || 0);
      if (activeFilter === 'in-stock' && qty <= 0) return false;
      if (activeFilter === 'low-stock' && qty > alertQty) return false;
      if (activeFilter.startsWith('cat:')) {
        const catId = activeFilter.replace('cat:', '');
        if (item.categoryId !== catId) return false;
      }
      return true;
    });

    if (!filtered.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    grid.innerHTML = filtered.map(item => {
      const qty = Number(item.quantity || 0);
      const isLow = qty <= Number(item.alertQty || 0);
      const isOut = qty <= 0;
      return `
        <div class="pos-product-card ${isOut ? 'out-of-stock' : ''}" data-item-id="${esc(item.id)}">
          <div class="pos-p-head">
            <strong class="pos-p-name">${esc(item.name)}</strong>
            <span class="pill sm ${isOut ? 'red' : isLow ? 'accent' : 'teal'}">
              ${isOut ? 'نفد' : `${fmt(qty, Number.isInteger(qty) ? 0 : 2)} ${esc(item.unit || 'حبة')}`}
            </span>
          </div>
          <div class="pos-p-foot">
            <span class="pos-p-price">${fmt(item.sellPrice || 0)} <small>${esc(cur.symbol)}</small></span>
            <button class="pos-p-add-btn" title="إضافة للسلة">＋</button>
          </div>
        </div>
      `;
    }).join('');

    $$('.pos-product-card', grid).forEach(card => {
      card.onclick = () => {
        const id = card.dataset.itemId;
        const item = store.get('items', id);
        if (item) addToCart(item);
      };
    });
  }

  // فلترة الأصناف
  $('#pos-search', container).addEventListener('input', renderProducts);
  renderCategoryFilters();

  // إضافة صنف حر / مخصص
  $('#pos-add-custom-item', container).onclick = () => openCustomItemModal();
  $('#pos-new-inventory-item', container).onclick = () => openNewInventoryModal(() => renderProducts());
  $('#pos-new-customer-btn', container).onclick = () => openNewCustomerModal((newAcc) => {
    selectedCustomerId = newAcc.id;
    updateCustomerSelect();
  });

  // تحديث قائمة العملاء
  function updateCustomerSelect() {
    const sel = $('#pos-customer-select', container);
    const updatedCustomers = store.accounts(true).filter(a => a.kind === 'customer' || a.kind === 'general');
    sel.innerHTML = `
      <option value="">🛒 عميل نقدي (كاش / بدون حساب)</option>
      ${updatedCustomers.map(c => {
        const bal = store.balance(c.id);
        const balText = bal > 0 ? ` (عليه: ${fmt(bal)} ${store.currency(c.currency).symbol})` : bal < 0 ? ` (له: ${fmt(Math.abs(bal))} ${store.currency(c.currency).symbol})` : '';
        return `<option value="${esc(c.id)}" ${c.id === selectedCustomerId ? 'selected' : ''}>${ACCOUNT_KINDS[c.kind] ? ACCOUNT_KINDS[c.kind].icon : '👤'} ${esc(c.name)}${balText}</option>`;
      }).join('')}
    `;
    updateCustomerStatus();
  }

  function updateCustomerStatus() {
    const custId = $('#pos-customer-select', container).value;
    selectedCustomerId = custId;
    const box = $('#pos-customer-status', container);
    if (!custId) {
      box.innerHTML = `<span class="muted" style="font-size:12px">💡 المبيعات النقدية لا تتطلب تحديد عميل. للمبيعات الآجلة والجزئية، اختر حساب عميل.</span>`;
      return;
    }
    const acc = store.getAccount(custId);
    if (!acc) { box.innerHTML = ''; return; }
    const bal = store.balance(acc.id);
    const { oweUs, oweThem } = balanceLabels(store.settings());
    const natureText = bal > 0 ? `مديونية حالية (${oweUs}): ${fmt(bal)} ${store.currency(acc.currency).symbol}` : bal < 0 ? `رصيد دائن (${oweThem}): ${fmt(Math.abs(bal))} ${store.currency(acc.currency).symbol}` : 'الرصيد خالص (0)';
    box.innerHTML = `
      <div class="pos-cust-info">
        <span class="pill ${bal > 0 ? 'red' : 'green'}">${natureText}</span>
        ${acc.phone || acc.whatsapp ? `<span class="muted">📞 ${esc(acc.whatsapp || acc.phone)}</span>` : ''}
      </div>
    `;
  }

  $('#pos-customer-select', container).addEventListener('change', updateCustomerStatus);

  // تحديث السلة
  function renderCart() {
    const countEl = $('#pos-cart-count', container);
    const listEl = $('#pos-cart-list', container);
    const emptyEl = $('#pos-cart-empty', container);
    const count = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    countEl.textContent = count;

    if (!cart.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      listEl.innerHTML = cart.map((item, index) => {
        const itemTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
        return `
          <div class="pos-cart-row" data-index="${index}">
            <div class="pos-c-info">
              <strong class="pos-c-name">${esc(item.name)}</strong>
              <div class="pos-c-unit-price">
                سعر الوحدة:
                <input type="number" class="pos-c-price-input" data-cart-price="${index}" value="${item.unitPrice}" min="0" step="any">
                <small>${esc(cur.symbol)} / ${esc(item.unit || 'حبة')}</small>
              </div>
            </div>
            <div class="pos-c-qty-ctrls">
              <button class="pos-qty-btn" data-cart-dec="${index}">−</button>
              <input type="number" class="pos-qty-input" data-cart-qty="${index}" value="${item.quantity}" min="0.01" step="any">
              <button class="pos-qty-btn" data-cart-inc="${index}">＋</button>
            </div>
            <div class="pos-c-total">
              <strong>${fmt(itemTotal, cur.decimal)}</strong>
              <small>${esc(cur.symbol)}</small>
            </div>
            <button class="icon-btn sm" data-cart-del="${index}" style="color:var(--danger);width:28px;height:28px" title="حذف">🗑️</button>
          </div>
        `;
      }).join('');
    }

    recalcTotals();
  }

  function recalcTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
    discount = Number($('#pos-discount-val', container).value) || 0;
    discountType = $('#pos-discount-type', container).value;

    let discountAmount = 0;
    if (discountType === 'percent') {
      discountAmount = (subtotal * Math.min(100, Math.max(0, discount))) / 100;
    } else {
      discountAmount = Math.min(subtotal, Math.max(0, discount));
    }

    const grandTotal = Math.max(0, subtotal - discountAmount);

    $('#pos-subtotal', container).textContent = `${fmt(subtotal, cur.decimal)} ${cur.symbol}`;
    $('#pos-discount-val-display', container).textContent = discountAmount > 0 ? `-${fmt(discountAmount, cur.decimal)} ${cur.symbol}` : `0 ${cur.symbol}`;
    $('#pos-grand-total', container).textContent = `${fmt(grandTotal, cur.decimal)} ${cur.symbol}`;

    // حساب الدفع الجزئي
    if (paymentType === 'partial') {
      const paidInput = $('#pos-paid-amount', container);
      let paidVal = Number(paidInput.value) || 0;
      if (paidVal > grandTotal) {
        paidVal = grandTotal;
        paidInput.value = grandTotal;
      }
      paidAmount = paidVal;
      const remainingDebt = Math.max(0, grandTotal - paidAmount);
      $('#pos-remaining-debt', container).textContent = `${fmt(remainingDebt, cur.decimal)} ${cur.symbol}`;
    }
  }

  // إضافة صنف للسلة
  function addToCart(item) {
    const existingIndex = cart.findIndex(c => (c.itemId && c.itemId === item.id) || (c.name === item.name && c.unitPrice === Number(item.sellPrice || 0)));
    if (existingIndex >= 0) {
      cart[existingIndex].quantity += 1;
    } else {
      cart.push({
        id: uid('cart_item'),
        itemId: item.id || null,
        name: item.name,
        unit: item.unit || 'حبة',
        quantity: 1,
        unitPrice: Number(item.sellPrice || 0),
        buyPrice: Number(item.buyPrice || 0),
      });
    }
    renderCart();
  }

  // أحداث السلة
  $('#pos-cart-list', container).addEventListener('click', (e) => {
    const inc = e.target.closest('[data-cart-inc]');
    if (inc) {
      const idx = Number(inc.dataset.cartInc);
      if (cart[idx]) { cart[idx].quantity += 1; renderCart(); }
      return;
    }
    const dec = e.target.closest('[data-cart-dec]');
    if (dec) {
      const idx = Number(dec.dataset.cartDec);
      if (cart[idx]) {
        if (cart[idx].quantity > 1) { cart[idx].quantity -= 1; }
        else { cart.splice(idx, 1); }
        renderCart();
      }
      return;
    }
    const del = e.target.closest('[data-cart-del]');
    if (del) {
      const idx = Number(del.dataset.cartDel);
      cart.splice(idx, 1);
      renderCart();
    }
  });

  $('#pos-cart-list', container).addEventListener('change', (e) => {
    const qtyInput = e.target.closest('[data-cart-qty]');
    if (qtyInput) {
      const idx = Number(qtyInput.dataset.cartQty);
      const val = Number(qtyInput.value);
      if (cart[idx]) {
        if (val > 0) cart[idx].quantity = val;
        else cart.splice(idx, 1);
        renderCart();
      }
      return;
    }
    const priceInput = e.target.closest('[data-cart-price]');
    if (priceInput) {
      const idx = Number(priceInput.dataset.cartPrice);
      const val = Number(priceInput.value);
      if (cart[idx] && val >= 0) {
        cart[idx].unitPrice = val;
        renderCart();
      }
    }
  });

  $('#pos-clear-cart', container).onclick = async () => {
    if (!cart.length) return;
    const ok = await confirmDialog({ title: 'مسح السلة', message: 'هل تريد مسح جميع الأصناف من السلة الحالية؟', danger: true });
    if (ok) {
      cart = [];
      renderCart();
    }
  };

  $('#pos-discount-val', container).addEventListener('input', recalcTotals);
  $('#pos-discount-type', container).addEventListener('change', recalcTotals);
  $('#pos-paid-amount', container).addEventListener('input', () => {
    paidAmount = Number($('#pos-paid-amount', container).value) || 0;
    recalcTotals();
  });

  // معالجة أزرار النسب السريعة للدفع الجزئي
  $$('[data-pos-pchip]', container).forEach(btn => {
    btn.onclick = () => {
      const subtotal = cart.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
      let discAmt = discountType === 'percent' ? (subtotal * discount) / 100 : discount;
      const grand = Math.max(0, subtotal - discAmt);
      const action = btn.dataset.posPchip;
      if (action === 'clear') {
        paidAmount = 0;
        $('#pos-paid-amount', container).value = '';
      } else {
        const ratio = parseFloat(action) || 0.5;
        paidAmount = Math.round(grand * ratio);
        $('#pos-paid-amount', container).value = paidAmount;
      }
      recalcTotals();
    };
  });

  // تغيير نوع الدفع
  $$('input[name="pos_pay"]', container).forEach(radio => {
    radio.addEventListener('change', () => {
      paymentType = radio.value;
      $$('.pos-pay-option', container).forEach(opt => opt.classList.toggle('active', opt.querySelector('input').checked));
      const partialBox = $('#pos-partial-box', container);
      if (paymentType === 'partial') {
        partialBox.classList.remove('hidden');
        const subtotal = cart.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
        let discAmt = discountType === 'percent' ? (subtotal * discount) / 100 : discount;
        const grand = Math.max(0, subtotal - discAmt);
        if (!paidAmount || paidAmount <= 0) {
          paidAmount = Math.round(grand / 2);
          $('#pos-paid-amount', container).value = paidAmount;
        }
        setTimeout(() => {
          const input = $('#pos-paid-amount', container);
          if (input) input.focus();
        }, 50);
      } else {
        partialBox.classList.add('hidden');
      }
      recalcTotals();
    });
  });

  // تنفيذ البيع وإصدار الفاتورة
  async function submitSale(afterAction = 'none') {
    if (!cart.length) {
      toastErr('السلة فارغة. أضف أصنافاً لإتمام الفاتورة');
      return;
    }

    const subtotal = cart.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
    let discountAmount = discountType === 'percent' ? (subtotal * discount) / 100 : discount;
    discountAmount = Math.min(subtotal, Math.max(0, discountAmount));
    const grandTotal = Math.max(0, subtotal - discountAmount);

    const custId = $('#pos-customer-select', container).value;
    const ref = ($('#pos-ref', container).value || '').trim() || generateInvoiceRef();
    const note = ($('#pos-note', container).value || '').trim();

    // التحقق من متطلبات البيع الآجل والجزئي
    if ((paymentType === 'credit' || paymentType === 'partial') && !custId) {
      toastErr('يجب اختيار حساب عميل لإصدار فاتورة آجلة أو دفع جزئي لتقييد الدين في حسابه.');
      $('#pos-customer-select', container).focus();
      return;
    }

    if (paymentType === 'partial') {
      const pAmt = Number($('#pos-paid-amount', container).value) || 0;
      if (pAmt <= 0) {
        toastErr('أدخل المبلغ المدفوع نقداً للدفعة الجزئية');
        return;
      }
      if (pAmt >= grandTotal) {
        toastErr('المبلغ المدفوع يساوي أو يتجاوز إجمالي الفاتورة؛ اختر "نقدي"');
        return;
      }
      paidAmount = pAmt;
    }

    const customer = custId ? store.getAccount(custId) : null;
    const invoiceDate = todayISO();
    const invoiceTime = nowTime();
    const invoiceItemsList = cart.map(item => ({
      itemId: item.itemId || null,
      name: item.name,
      unit: item.unit || 'حبة',
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      total: Number(item.quantity || 0) * Number(item.unitPrice || 0),
    }));

    // تحديد نوع المعاملة المحاسبية والبيان
    let primaryTx = null;
    let paymentTx = null;
    const remainingDebt = paymentType === 'partial' ? Math.max(0, grandTotal - paidAmount) : (paymentType === 'credit' ? grandTotal : 0);

    const descSummary = `فاتورة مبيعات ${ref} (${paymentType === 'cash' ? 'نقدي' : paymentType === 'credit' ? 'آجل دين' : paymentType === 'partial' ? `جزئي: دفعة ${fmt(paidAmount)} ومتبقي دين ${fmt(remainingDebt)}` : 'تحويل'})` + (note ? ` — ${note}` : '');

    if (paymentType === 'credit') {
      // بيع آجل بالكامل: تسجيل قيد بيع آجل على العميل
      primaryTx = {
        id: uid('tx'),
        accountId: customer.id,
        accountKind: customer.kind || 'customer',
        type: 'debit', // أثر +1 على رصيد العميل (يصبح عليه دين)
        amount: grandTotal,
        currency: customer.currency || cur.code,
        date: invoiceDate,
        time: invoiceTime,
        desc: descSummary,
        ref,
        tags: ['مبيعات', 'فاتورة_آجلة', 'دين'],
        status: 'completed',
        invoiceItems: invoiceItemsList,
        discount: discountAmount,
        discountType,
        createdBy: (store.findBy('users', u => u.me) || {}).name || 'المدير',
        createdAt: new Date().toISOString(),
      };
      await store.saveTransaction(primaryTx);

    } else if (paymentType === 'partial') {
      // دفع جزئي:
      // 1. تسجيل الفاتورة الكاملة كـ debit (دين على العميل)
      primaryTx = {
        id: uid('tx'),
        accountId: customer.id,
        accountKind: customer.kind || 'customer',
        type: 'debit',
        amount: grandTotal,
        currency: customer.currency || cur.code,
        date: invoiceDate,
        time: invoiceTime,
        desc: `فاتورة مبيعات جزئية ${ref} — إجمالي ${fmt(grandTotal)} (متبقي دين: ${fmt(remainingDebt)})` + (note ? ` — ${note}` : ''),
        ref,
        tags: ['مبيعات', 'فاتورة_جزئية', 'دين_جزئي'],
        status: 'completed',
        invoiceItems: invoiceItemsList,
        discount: discountAmount,
        paidAmount,
        remainingDebt,
        createdBy: (store.findBy('users', u => u.me) || {}).name || 'المدير',
        createdAt: new Date().toISOString(),
      };
      await store.saveTransaction(primaryTx);

      // 2. تسجيل سند قبض/سداد نقدي فوري بالدفعة المقدمة
      paymentTx = {
        id: uid('tx'),
        accountId: customer.id,
        accountKind: customer.kind || 'customer',
        type: 'in', // قبض نقدي يقلل من دين العميل بمقدار الدفعة
        amount: paidAmount,
        currency: customer.currency || cur.code,
        date: invoiceDate,
        time: invoiceTime,
        desc: `دفعة نقدية مسددة فوراً من فاتورة المبيعات ${ref}`,
        ref: ref + '-P',
        tags: ['مبيعات', 'دفعة_نقدية', 'سداد'],
        status: 'completed',
        createdBy: (store.findBy('users', u => u.me) || {}).name || 'المدير',
        createdAt: new Date().toISOString(),
      };
      await store.saveTransaction(paymentTx);

    } else {
      // بيع نقدي أو بنكي:
      // إذا تم تحديد عميل، نسجل كـ debit + in أو revenue
      if (customer) {
        primaryTx = {
          id: uid('tx'),
          accountId: customer.id,
          accountKind: customer.kind || 'customer',
          type: 'debit',
          amount: grandTotal,
          currency: customer.currency || cur.code,
          date: invoiceDate,
          time: invoiceTime,
          desc: descSummary,
          ref,
          tags: ['مبيعات', paymentType === 'cash' ? 'نقدي' : 'تحويل'],
          status: 'completed',
          invoiceItems: invoiceItemsList,
          discount: discountAmount,
          createdBy: (store.findBy('users', u => u.me) || {}).name || 'المدير',
          createdAt: new Date().toISOString(),
        };
        await store.saveTransaction(primaryTx);

        // وقيد سداد نقدي مساوي
        paymentTx = {
          id: uid('tx'),
          accountId: customer.id,
          accountKind: customer.kind || 'customer',
          type: 'in',
          amount: grandTotal,
          currency: customer.currency || cur.code,
          date: invoiceDate,
          time: invoiceTime,
          desc: `سداد نقدي كامل لفاتورة المبيعات ${ref}`,
          ref: ref + '-C',
          tags: ['مبيعات', 'سداد_نقدي'],
          status: 'completed',
          createdBy: (store.findBy('users', u => u.me) || {}).name || 'المدير',
          createdAt: new Date().toISOString(),
        };
        await store.saveTransaction(paymentTx);
      } else {
        // عميل نقدي عام
        primaryTx = {
          id: uid('tx'),
          accountId: null,
          accountKind: 'general',
          type: 'revenue',
          amount: grandTotal,
          currency: cur.code,
          date: invoiceDate,
          time: invoiceTime,
          desc: `فاتورة مبيعات نقدية ${ref}` + (note ? ` — ${note}` : ''),
          ref,
          tags: ['مبيعات', 'نقدي_عام'],
          status: 'completed',
          invoiceItems: invoiceItemsList,
          discount: discountAmount,
          createdBy: (store.findBy('users', u => u.me) || {}).name || 'المدير',
          createdAt: new Date().toISOString(),
        };
        await store.saveTransaction(primaryTx);
      }
    }

    // خصم الكميات المباعة من رصيد المخزون
    let lowStockAlerts = [];
    for (const item of cart) {
      if (item.itemId) {
        const invItem = store.get('items', item.itemId);
        if (invItem) {
          const newQty = Math.max(0, Number(invItem.quantity || 0) - Number(item.quantity || 0));
          invItem.quantity = newQty;
          await store.save('items', invItem, { silent: true, noActivity: true });
          if (newQty <= Number(invItem.alertQty || 0)) {
            lowStockAlerts.push(`${invItem.name} (المتبقي: ${newQty} ${invItem.unit || 'حبة'})`);
          }
        }
      }
    }

    if (customer) {
      customer.lastTxAt = new Date().toISOString();
      await store.save('accounts', customer, { silent: true, noActivity: true });
    }

    toast(`تم حفظ الفاتورة ${ref} بنجاح وتحديث الأرصدة والمخزون ✅`);
    if (lowStockAlerts.length) {
      toast(`⚠️ تنبيه مخزون: قارب على النفاد: ${lowStockAlerts.join('، ')}`, 'warn');
    }

    // الإجراء التالي (طباعة أو إرسال إشعار واتساب/رسالة)
    if (afterAction === 'print') {
      openInvoicePrintModal(primaryTx, customer, grandTotal, paidAmount, remainingDebt);
    } else if (afterAction === 'whatsapp') {
      if (customer && (customer.whatsapp || customer.phone)) {
        await dispatchTransactionNotification(primaryTx, { forceChannel: 'whatsapp', automatic: false });
      } else {
        openInvoicePrintModal(primaryTx, customer, grandTotal, paidAmount, remainingDebt);
        toast('لم يتم العثور على رقم هاتف للعميل، فُتحت المعاينة والطباعة', 'warn');
      }
    } else {
      // حفظ عادي: إذا تم تفعيل الإرسال التلقائي في الإعدادات ولديه رقم
      if (customer && (customer.whatsapp || customer.phone)) {
        await dispatchTransactionNotification(primaryTx, { automatic: true });
      }
    }

    // تصفير السلة للعملية التالية
    cart = [];
    paidAmount = 0;
    discount = 0;
    invoiceNote = '';
    invoiceRef = generateInvoiceRef();
    $('#pos-ref', container).value = invoiceRef;
    $('#pos-note', container).value = '';
    $('#pos-discount-val', container).value = '';
    renderCart();
    renderProducts();
    updateCustomerStatus();
  }

  $('#pos-submit-btn', container).onclick = () => submitSale('none');
  $('#pos-save-print-btn', container).onclick = () => submitSale('print');
  $('#pos-save-wa-btn', container).onclick = () => submitSale('whatsapp');

  renderProducts();
  renderCart();
  updateCustomerStatus();
}

// ======================== سجل فواتير المبيعات ========================
function renderPOSHistory(container, cur) {
  const allTxs = store.transactions();
  const salesTxs = allTxs.filter(t => (t.tags && t.tags.includes('مبيعات')) || (t.invoiceItems && t.invoiceItems.length > 0));

  // إحصائيات المبيعات
  const today = todayISO();
  const todaySales = salesTxs.filter(t => t.date === today && t.type !== 'in'); // استثناء سندات السداد الفرعية
  const totalToday = todaySales.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const creditToday = todaySales.filter(t => t.tags && (t.tags.includes('فاتورة_آجلة') || t.tags.includes('فاتورة_جزئية'))).reduce((sum, t) => sum + (t.remainingDebt !== undefined ? Number(t.remainingDebt) : Number(t.amount || 0)), 0);
  const cashToday = Math.max(0, totalToday - creditToday);

  container.innerHTML = `
    <div class="grid grid-3" style="margin-bottom:20px">
      <div class="card stat-card tone-teal">
        <div class="stat-ic">🛍️</div>
        <div class="label">إجمالي مبيعات اليوم</div>
        <div class="value">${fmt(totalToday)} <small style="font-size:14px">${esc(cur.symbol)}</small></div>
        <div class="sub">${todaySales.length} فاتورة مسجلة اليوم</div>
      </div>
      <div class="card stat-card tone-green">
        <div class="stat-ic">💵</div>
        <div class="label">المبيعات النقدية المسددة</div>
        <div class="value">${fmt(cashToday)} <small style="font-size:14px">${esc(cur.symbol)}</small></div>
        <div class="sub">تم تحصيلها في الصندوق</div>
      </div>
      <div class="card stat-card tone-accent">
        <div class="stat-ic">📝</div>
        <div class="label">المبيعات الآجلة (ديون جديدة)</div>
        <div class="value">${fmt(creditToday)} <small style="font-size:14px">${esc(cur.symbol)}</small></div>
        <div class="sub">مضافة لحسابات وذمم العملاء</div>
      </div>
    </div>

    <div class="card">
      <div class="toolbar" style="padding:0;margin-bottom:14px;border:none">
        <div class="search-input"><input id="pos-hist-q" placeholder="بحث بالمرجع، اسم العميل، الأصناف..."><span class="s-ic">🔍</span></div>
        <select class="select" id="pos-hist-type">
          <option value="">كل أنواع الفواتير</option>
          <option value="cash">نقدية</option>
          <option value="credit">آجلة (ديون)</option>
          <option value="partial">دفع جزئي</option>
        </select>
        <input type="date" class="select" id="pos-hist-from">
        <input type="date" class="select" id="pos-hist-to">
        <button class="btn ghost sm" id="pos-hist-export">📊 تصدير Excel</button>
      </div>

      <div id="pos-hist-table-wrap"></div>
      <div class="empty" id="pos-hist-empty" hidden><div class="e-ic">🧾</div><h3>لا توجد فواتير مبيعات مطابقة</h3></div>
    </div>
  `;

  function applyHistoryFilter() {
    const q = ($('#pos-hist-q', container).value || '').trim().toLowerCase();
    const type = $('#pos-hist-type', container).value;
    const from = $('#pos-hist-from', container).value;
    const to = $('#pos-hist-to', container).value;

    const list = salesTxs.filter(t => {
      // استثناء سندات السداد النقدية المنفصلة من جدول الفواتير الرئيسي
      if (t.tags && t.tags.includes('دفعة_نقدية')) return false;

      const acc = store.getAccount(t.accountId);
      const accName = acc ? acc.name : 'عميل نقدي';
      const itemNames = (t.invoiceItems || []).map(x => x.name).join(' ');
      if (q && !(t.ref + ' ' + t.desc + ' ' + accName + ' ' + itemNames).toLowerCase().includes(q)) return false;
      if (type === 'cash' && t.tags && (t.tags.includes('فاتورة_آجلة') || t.tags.includes('فاتورة_جزئية'))) return false;
      if (type === 'credit' && (!t.tags || !t.tags.includes('فاتورة_آجلة'))) return false;
      if (type === 'partial' && (!t.tags || !t.tags.includes('فاتورة_جزئية'))) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    });

    const wrap = $('#pos-hist-table-wrap', container);
    const empty = $('#pos-hist-empty', container);

    if (!list.length) {
      wrap.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    wrap.innerHTML = `
      <div class="table-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>المرجع</th>
              <th>التاريخ والوقت</th>
              <th>العميل</th>
              <th>الأصناف</th>
              <th>نوع الدفع</th>
              <th>الإجمالي</th>
              <th>المدفوع / المتبقي دين</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map(t => {
              const acc = store.getAccount(t.accountId);
              const isCredit = t.tags && t.tags.includes('فاتورة_آجلة');
              const isPartial = t.tags && t.tags.includes('فاتورة_جزئية');
              const typeBadge = isCredit ? '<span class="pill red">آجل (دين)</span>' : isPartial ? '<span class="pill accent">دفع جزئي</span>' : '<span class="pill green">نقدي</span>';
              const itemsCount = (t.invoiceItems || []).length;
              return `
                <tr class="row-click" data-open-pos-invoice="${esc(t.id)}">
                  <td><b>${esc(t.ref || '—')}</b></td>
                  <td style="white-space:nowrap">${esc(t.date)} <small class="muted">${esc(t.time || '')}</small></td>
                  <td><b>${esc(acc ? acc.name : 'عميل نقدي')}</b></td>
                  <td>${itemsCount ? `<span class="tag">🛒 ${itemsCount} صنف</span>` : '<span class="muted">—</span>'}</td>
                  <td>${typeBadge}</td>
                  <td><b class="amount up">${fmt(t.amount)} ${esc(store.currency(t.currency).symbol)}</b></td>
                  <td>
                    ${isPartial ? `<span style="font-size:12px">مدفوع: ${fmt(t.paidAmount)} | <b style="color:var(--danger)">دين: ${fmt(t.remainingDebt)}</b></span>` : isCredit ? `<span style="color:var(--danger);font-weight:700">دين كامل: ${fmt(t.amount)}</span>` : '<span style="color:var(--green)">مسدد بالكامل</span>'}
                  </td>
                  <td style="white-space:nowrap">
                    <button class="btn sm ghost" data-print-invoice="${esc(t.id)}" title="معاينة وطباعة">🖨️</button>
                    <button class="btn sm success" data-wa-invoice="${esc(t.id)}" title="مشاركة واتساب">🟢</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    $$('[data-open-pos-invoice]', wrap).forEach(row => {
      row.onclick = () => {
        const id = row.dataset.openPosInvoice;
        go('transactions', { id });
      };
    });

    $$('[data-print-invoice]', wrap).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const t = store.get('transactions', btn.dataset.printInvoice);
        if (t) {
          const acc = store.getAccount(t.accountId);
          openInvoicePrintModal(t, acc, t.amount, t.paidAmount || (t.tags && t.tags.includes('فاتورة_آجلة') ? 0 : t.amount), t.remainingDebt || (t.tags && t.tags.includes('فاتورة_آجلة') ? t.amount : 0));
        }
      };
    });

    $$('[data-wa-invoice]', wrap).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const t = store.get('transactions', btn.dataset.waInvoice);
        if (t) dispatchTransactionNotification(t, { automatic: false });
      };
    });
  }

  $('#pos-hist-q', container).addEventListener('input', applyHistoryFilter);
  $('#pos-hist-type', container).addEventListener('change', applyHistoryFilter);
  $('#pos-hist-from', container).addEventListener('change', applyHistoryFilter);
  $('#pos-hist-to', container).addEventListener('change', applyHistoryFilter);
  $('#pos-hist-export', container).onclick = () => {
    exportExcel('سجل فواتير المبيعات', ['المرجع', 'التاريخ', 'الوقت', 'العميل', 'النوع', 'الإجمالي', 'المدفوع', 'المتبقي دين'],
      salesTxs.map(t => {
        const acc = store.getAccount(t.accountId);
        return [t.ref || '', t.date, t.time || '', acc ? acc.name : 'عميل نقدي', (t.tags || []).join(' '), t.amount, t.paidAmount || (t.tags && t.tags.includes('فاتورة_آجلة') ? 0 : t.amount), t.remainingDebt || (t.tags && t.tags.includes('فاتورة_آجلة') ? t.amount : 0)];
      }));
    toast('تم تصدير سجل المبيعات Excel ✅');
  };

  applyHistoryFilter();
}

// ======================== مودالات مساعدة ========================

// توليد رقم فاتورة تلقائي
function generateInvoiceRef() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${rand}`;
}

// مودال إضافة صنف حر / مخصص
function openCustomItemModal() {
  const m = openModal({
    title: '＋ إضافة صنف حر للفاتورة',
    body: `
      <form id="pos-custom-item-form">
        ${field({ type: 'text', name: 'name', label: 'اسم الصنف أو الخدمة', placeholder: 'مثال: صيانة، شاي، منتج خاص...', required: true })}
        <div class="field-row">
          ${field({ type: 'text', name: 'unit', label: 'الوحدة', value: 'حبة' })}
          ${field({ type: 'number', name: 'quantity', label: 'الكمية', value: 1, required: true })}
        </div>
        ${field({ type: 'number', name: 'sellPrice', label: 'سعر البيع للوحدة', value: '', required: true })}
      </form>
    `,
    foot: '<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="pos-custom-save">إضافة للسلة 🛒</button>',
  });

  $('#pos-custom-save', m.overlay).onclick = () => {
    const d = readForm('#pos-custom-item-form', m.overlay);
    if (!d.name || !String(d.name).trim()) { toastErr('أدخل اسم الصنف'); return; }
    const qty = Number(d.quantity);
    const price = Number(d.sellPrice);
    if (!qty || qty <= 0 || price < 0) { toastErr('تحقق من الكمية والسعر'); return; }

    cart.push({
      id: uid('cart_item'),
      itemId: null,
      name: d.name.trim(),
      unit: d.unit || 'حبة',
      quantity: qty,
      unitPrice: price,
      buyPrice: 0,
    });

    toast('تمت إضافة الصنف إلى السلة ✅');
    m.close();
    // إعادة رسم السلة
    const cartList = document.getElementById('pos-cart-list');
    if (cartList) {
      const container = document.getElementById('view');
      if (container) render(container, { tab: 'sale' }, {});
    }
  };
}

// مودال إضافة صنف جديد للمخزون
function openNewInventoryModal(cb) {
  const categories = store.list('categories');
  const catOptions = [
    { value: '', label: 'بدون فئة (عام)' },
    ...categories.map(c => ({ value: c.id, label: (c.icon ? c.icon + ' ' : '') + c.name }))
  ];

  const m = openModal({
    title: '📦 إضافة صنف جديد للمخزون',
    body: `
      <form id="pos-new-inv-form">
        ${field({ type: 'text', name: 'name', label: 'اسم الصنف', required: true })}
        <div class="field">
          <label>الفئة / القسم</label>
          <select name="categoryId" id="pos-new-inv-cat" class="select" style="width:100%;padding:10px">
            ${catOptions.map(opt => `<option value="${esc(opt.value)}">${esc(opt.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          ${field({ type: 'text', name: 'unit', label: 'الوحدة', value: 'حبة' })}
          ${field({ type: 'number', name: 'quantity', label: 'الكمية الابتدائية', value: 10, required: true })}
        </div>
        <div class="field-row">
          ${field({ type: 'number', name: 'buyPrice', label: 'سعر الشراء', value: 0 })}
          ${field({ type: 'number', name: 'sellPrice', label: 'سعر البيع', value: 0, required: true })}
        </div>
        ${field({ type: 'number', name: 'alertQty', label: 'حد التنبيه الأدنى', value: 3 })}
      </form>
    `,
    foot: '<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="pos-inv-save">حفظ الصنف 💾</button>',
  });

  $('#pos-inv-save', m.overlay).onclick = async () => {
    const d = readForm('#pos-new-inv-form', m.overlay);
    if (!d.name || !String(d.name).trim()) { toastErr('أدخل اسم الصنف'); return; }
    const qty = Number(d.quantity || 0);
    const buyPrice = Number(d.buyPrice || 0);
    const sellPrice = Number(d.sellPrice || 0);
    const alertQty = Number(d.alertQty || 0);

    const newItem = {
      id: uid('item'),
      name: d.name.trim(),
      categoryId: d.categoryId || '',
      unit: d.unit || 'حبة',
      quantity: qty,
      buyPrice,
      sellPrice,
      alertQty,
      createdAt: new Date().toISOString(),
    };
    await store.save('items', newItem);
    toast('تمت إضافة الصنف للمخزون ✅');
    m.close();
    if (cb) cb(newItem);
  };
}

// مودال إضافة عميل جديد
function openNewCustomerModal(cb) {
  const m = openModal({
    title: '👤 إضافة عميل جديد سريعاً',
    body: `
      <form id="pos-new-cust-form">
        ${field({ type: 'text', name: 'name', label: 'اسم العميل', required: true })}
        <div class="field-row">
          ${field({ type: 'tel', name: 'phone', label: 'رقم الهاتف' })}
          ${field({ type: 'tel', name: 'whatsapp', label: 'واتساب' })}
        </div>
        ${field({ type: 'money', name: 'openingBalance', label: 'الرصيد الافتتاحي (إن وجد)', value: '' })}
      </form>
    `,
    foot: '<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="pos-cust-save">حفظ العميل 💾</button>',
  });

  $('#pos-cust-save', m.overlay).onclick = async () => {
    const d = readForm('#pos-new-cust-form', m.overlay);
    if (!d.name || !String(d.name).trim()) { toastErr('أدخل اسم العميل'); return; }

    const newCust = {
      id: uid('acc'),
      name: d.name.trim(),
      kind: 'customer',
      openingBalance: Number(d.openingBalance || 0),
      currency: store.settings().defaultCurrency || 'YER',
      phone: d.phone || '',
      whatsapp: d.whatsapp || d.phone || '',
      notes: '',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    await store.saveAccount(newCust);
    toast('تمت إضافة العميل بنجاح ✅');
    m.close();
    if (cb) cb(newCust);
  };
}

// مودال معاينة وطباعة الفاتورة
function openInvoicePrintModal(t, customer, grandTotal, paid, remaining) {
  const st = store.settings();
  const cur = store.currency(t.currency || st.defaultCurrency || 'YER');
  const lines = t.invoiceItems || [];

  const html = `
    <div class="transaction-receipt" dir="rtl" style="font-family:var(--font);background:#fff;color:#111;padding:24px;border-radius:14px;border:1px solid #e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f766e;padding-bottom:12px;margin-bottom:16px">
        <div>
          <h2 style="font-size:22px;color:#0f766e;margin:0">${esc(st.businessName || 'مؤسسة تجارية')}</h2>
          <div style="font-size:12px;color:#64748b">${esc(st.address || '')} ${st.phone ? `— هاتف: ${esc(st.phone)}` : ''}</div>
        </div>
        <div style="text-align:left">
          <div style="font-size:18px;font-weight:800">فاتورة مبيعات</div>
          <div style="font-size:12px;color:#64748b">رقم: <b>${esc(t.ref || '—')}</b></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;background:#f8fafc;padding:10px;border-radius:8px;margin-bottom:16px;font-size:13px">
        <div><span>العميل:</span> <b>${esc(customer ? customer.name : 'عميل نقدي')}</b></div>
        <div><span>التاريخ:</span> <b>${esc(t.date || '')} ${esc(t.time || '')}</b></div>
        <div><span>العملة:</span> <b>${esc(cur.name)} (${esc(cur.symbol)})</b></div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13.5px">
        <thead>
          <tr style="background:#0f766e;color:#fff">
            <th style="padding:8px 10px;text-align:right">#</th>
            <th style="padding:8px 10px;text-align:right">الصنف</th>
            <th style="padding:8px 10px;text-align:center">الكمية</th>
            <th style="padding:8px 10px;text-align:left">سعر الوحدة</th>
            <th style="padding:8px 10px;text-align:left">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map((l, i) => `
            <tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:8px 10px">${i + 1}</td>
              <td style="padding:8px 10px"><b>${esc(l.name)}</b></td>
              <td style="padding:8px 10px;text-align:center">${fmt(l.quantity)} ${esc(l.unit || 'حبة')}</td>
              <td style="padding:8px 10px;text-align:left">${fmt(l.unitPrice, cur.decimal)}</td>
              <td style="padding:8px 10px;text-align:left;font-weight:700">${fmt(l.total, cur.decimal)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="background:#f1f5f9;padding:14px;border-radius:10px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:14px">
          <span>إجمالي الفاتورة:</span>
          <b>${fmt(grandTotal, cur.decimal)} ${esc(cur.symbol)}</b>
        </div>
        ${paid !== undefined && paid > 0 ? `
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:14px;color:#16a34a">
            <span>المدفوع نقداً:</span>
            <b>${fmt(paid, cur.decimal)} ${esc(cur.symbol)}</b>
          </div>
        ` : ''}
        ${remaining !== undefined && remaining > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800;color:#e11d48;border-top:1px dashed #cbd5e1;padding-top:6px">
            <span>المتبقي دين على العميل:</span>
            <b>${fmt(remaining, cur.decimal)} ${esc(cur.symbol)}</b>
          </div>
        ` : ''}
      </div>

      <div style="text-align:center;font-size:12px;color:#94a3b8">
        ${esc(st.voucherFooter || 'شكراً لتعاملكم معنا • فاتورة نظام المبيعات الإلكتروني')}
      </div>
    </div>
  `;

  const m = openModal({
    title: '🧾 فاتورة المبيعات',
    cls: 'lg',
    body: `<div id="pos-print-content">${html}</div>`,
    foot: `
      <button class="btn ghost" data-close>إغلاق</button>
      <button class="btn ghost" id="pos-do-print">🖨️ طباعة الفاتورة</button>
      <button class="btn success" id="pos-do-wa">🟢 مشاركة واتساب</button>
    `,
  });

  $('#pos-do-print', m.overlay).onclick = () => printHTML('فاتورة مبيعات - ' + (t.ref || ''), html);
  $('#pos-do-wa', m.overlay).onclick = () => shareTransactionReceipt(t);
}
