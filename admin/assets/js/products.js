// products.js — إدارة المنتجات داخل لوحة التحكم
(function () {
  const defaultProducts = [
    { name: 'عرض التين الأخضر الفاخر', desc: 'بوكس 5 كيلو تين أخضر فاخر.', price: '3.500', img: 'https://theenyanl30.vip/views/assets/source/top1.png' },
    { name: 'عرض تمر الصقعى الملكى', desc: 'بوكس 5 كيلو تمر صقعى ملكى فاخر.', price: '3.960', img: 'https://theenyanl30.vip/views/assets/source/top2.png' },
    { name: 'عرض تمر الخلاص المكبوس', desc: 'بوكس 8 كيلو تمر الخلاص المكبوس درجة أولى.', price: '3.500', img: 'https://theenyanl30.vip/views/assets/source/top3.png' },
    { name: 'عرض 50 عصفور التين', desc: 'بوكس 50 عصفور تين درجة أولى حجم كبير.', price: '10.000', img: 'https://theenyanl30.vip/views/assets/source/batt-5.jpg' }
  ];

  let productsCache = [];
  let editingProductIndex = null;

  function $(id) { return document.getElementById(id); }

  function getProducts() {
    return productsCache.length ? productsCache : (JSON.parse(localStorage.getItem('allProducts')) || defaultProducts);
  }

  async function persistProducts(products) {
    productsCache = products;
    if (typeof window.storeSaveProducts === 'function') {
      const ok = await window.storeSaveProducts(products);
      if (!ok) localStorage.setItem('allProducts', JSON.stringify(products));
    } else {
      localStorage.setItem('allProducts', JSON.stringify(products));
    }
  }

  function showSuccess(msg) {
    const el = $('pform-success');
    el.textContent = '✓ ' + msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }

  function showError(msg) {
    const el = $('pform-error');
    el.textContent = '✗ ' + msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }

  function resetForm() {
    $('product-form').reset();
    $('product-image-preview').classList.add('hidden');
    $('pform-title').textContent = 'إضافة منتج جديد';
    $('product-submit').textContent = 'حفظ المنتج';
    $('product-submit').classList.remove('bg-amber-600', 'hover:bg-amber-700');
    $('product-submit').classList.add('bg-emerald-600', 'hover:bg-emerald-700');
    $('product-cancel').classList.add('hidden');
    editingProductIndex = null;
  }

  function displayProducts() {
    const products = getProducts();
    const grid = $('products-grid');
    $('product-count').textContent = products.length;

    if (products.length === 0) {
      grid.innerHTML = '<div class="text-center py-10 text-slate-500"><p>لا توجد منتجات</p></div>';
      return;
    }

    grid.innerHTML = products.map((product, index) => `
      <div class="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 flex gap-4 hover:border-emerald-500/50 transition-colors">
        <div class="w-24 h-24 bg-slate-900 rounded-lg overflow-hidden flex-shrink-0">
          <img src="${product.img}" alt="${product.name}" class="w-full h-full object-cover">
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-white mb-1 truncate">${product.name}</div>
          <div class="text-sm text-slate-400 mb-2 line-clamp-2">${product.desc}</div>
          <div class="font-extrabold text-emerald-400">${product.price} د.ك</div>
        </div>
        <div class="flex flex-col gap-2 justify-center flex-shrink-0 w-24">
          <button class="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 rounded-lg py-2 text-xs font-bold transition-colors" onclick="window.adminProducts.edit(${index})">✏️ تعديل</button>
          <button class="bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30 rounded-lg py-2 text-xs font-bold transition-colors" onclick="window.adminProducts.remove(${index})">🗑️ حذف</button>
        </div>
      </div>
    `).join('');
  }

  function editProduct(index) {
    const products = getProducts();
    const product = products[index];
    editingProductIndex = index;
    $('product-name').value = product.name;
    $('product-desc').value = product.desc;
    $('product-price').value = product.price;
    $('product-preview-img').src = product.img;
    $('product-image-preview').classList.remove('hidden');
    $('pform-title').textContent = 'تعديل المنتج';
    $('product-submit').textContent = 'تحديث المنتج';
    $('product-submit').classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
    $('product-submit').classList.add('bg-amber-600', 'hover:bg-amber-700');
    $('product-cancel').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function deleteProduct(index) {
    const products = getProducts();
    const product = products[index];
    if (confirm(`هل تريد حذف "${product.name}"؟`)) {
      products.splice(index, 1);
      persistProducts(products);
      showSuccess('تم حذف المنتج بنجاح');
      displayProducts();
    }
  }

  function saveProduct(event) {
    event.preventDefault();
    const name = $('product-name').value.trim();
    const desc = $('product-desc').value.trim();
    const price = parseFloat($('product-price').value).toFixed(3);
    const fileInput = $('product-image');

    if (!name || !desc || !price) { showError('يرجى ملء جميع الحقول'); return; }

    // تعديل بدون صورة جديدة — نحتفظ بالصورة القديمة
    if (!fileInput.files[0] && editingProductIndex !== null) {
      const products = getProducts();
      const newProduct = { name, desc, price, img: products[editingProductIndex].img };
      if (products[editingProductIndex]._id) newProduct._id = products[editingProductIndex]._id;
      products[editingProductIndex] = newProduct;
      persistProducts(products);
      showSuccess('تم تحديث المنتج بنجاح');
      resetForm();
      displayProducts();
      return;
    }

    if (!fileInput.files[0] && editingProductIndex === null) {
      showError('يرجى إضافة صورة للمنتج');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
      const newProduct = { name, desc, price, img: e.target.result };
      const products = getProducts();
      if (editingProductIndex !== null) {
        if (products[editingProductIndex]._id) newProduct._id = products[editingProductIndex]._id;
        products[editingProductIndex] = newProduct;
        showSuccess('تم تحديث المنتج بنجاح');
      } else {
        products.unshift(newProduct);
        showSuccess('تم إضافة المنتج بنجاح');
      }
      persistProducts(products);
      resetForm();
      displayProducts();
    };
    reader.readAsDataURL(file);
  }

  // ── التهيئة ──────────────────────────────────────────────
  function init() {
    // معاينة الصورة
    $('product-image').addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (ev) {
          $('product-preview-img').src = ev.target.result;
          $('product-image-preview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
      }
    });

    $('product-form').addEventListener('submit', saveProduct);
    $('product-cancel').addEventListener('click', resetForm);

    // تحميل المنتجات من Firestore مع احتياطي محلي
    (async function () {
      const stored = JSON.parse(localStorage.getItem('allProducts')) || [];
      if (stored.length === 0) localStorage.setItem('allProducts', JSON.stringify(defaultProducts));
      if (typeof window.storeGetProducts === 'function') {
        productsCache = await window.storeGetProducts();
        if (!productsCache || productsCache.length === 0) {
          productsCache = JSON.parse(localStorage.getItem('allProducts')) || defaultProducts;
        }
      }
      displayProducts();
      if (typeof window.storeWatchProducts === 'function') {
        window.storeWatchProducts(function (items) {
          productsCache = items;
          if ($('products-view') && !$('products-view').classList.contains('hidden')) {
            displayProducts();
          } else {
            displayProducts();
          }
        });
      }
    })();
  }

  // واجهة عامة لأزرار التعديل/الحذف
  window.adminProducts = { edit: editProduct, remove: deleteProduct };

  // التهيئة عند جاهزية DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
