import { useState, useEffect } from "react";
import "./App.css";
import { CATEGORIES, CATEGORY_LABELS, MENU, FIXED_ICE_IDS, DEFAULT_OPTIONS, getQrImageUrl, getMenuImageUrl, computeUnitPrice, buildOptionSummary, format } from "./data/menu";
import { useKioskConnection, socket } from "./hooks/useKioskConnection";
import { useCart } from "./hooks/useCart";

const REMOTE_SITE_URL = process.env.REACT_APP_REMOTE_SITE_URL || "http://localhost:3000";
const FALLBACK_LOADING_TEXT = "Loading...";

const LARGE_TEXT_LABELS = {
  ko: { on: "🔠 큰 글씨 켜기", off: "🔠 큰 글씨 끄기" },
  en: { on: "🔠 Turn on large text", off: "🔠 Turn off large text" },
  zh: { on: "🔠 开启大字体", off: "🔠 关闭大字体" },
  ja: { on: "🔠 大きな文字をオン", off: "🔠 大きな文字をオフ" },
  vi: { on: "🔠 Bật chữ lớn", off: "🔠 Tắt chữ lớn" },
};

const LANGUAGE_LABELS = {
  ko: { title: "🌐 언어 선택", options: { ko: "한국어", en: "영어", zh: "중국어", ja: "일본어", vi: "베트남어" } },
  en: { title: "🌐 Select language", options: { ko: "Korean", en: "English", zh: "Chinese", ja: "Japanese", vi: "Vietnamese" } },
  zh: { title: "🌐 选择语言", options: { ko: "韩语", en: "英语", zh: "中文", ja: "日语", vi: "越南语" } },
  ja: { title: "🌐 言語を選択", options: { ko: "韓国語", en: "英語", zh: "中国語", ja: "日本語", vi: "ベトナム語" } },
  vi: { title: "🌐 Chọn ngôn ngữ", options: { ko: "Tiếng Hàn", en: "Tiếng Anh", zh: "Tiếng Trung", ja: "Tiếng Nhật", vi: "Tiếng Việt" } },
};
const LANGUAGE_OPTIONS = ["ko", "en", "zh", "ja", "vi"];

const HIGH_CONTRAST_LABELS = {
  ko: { on: "◐ 명암대비 모드 켜기", off: "◐ 명암대비 모드 끄기" },
  en: { on: "◐ Turn on high contrast", off: "◐ Turn off high contrast" },
  zh: { on: "◐ 开启高对比度", off: "◐ 关闭高对比度" },
  ja: { on: "◐ 高コントラストをオン", off: "◐ 高コントラストをオフ" },
  vi: { on: "◐ Bật độ tương phản cao", off: "◐ Tắt độ tương phản cao" },
};

export default function App() {
  const {
    t,
    kioskLang,
    setKioskLang,
    largeText,
    setLargeText,
    highContrast,
    setHighContrast,
    easyMode,
    kioskCode,
    kioskCodeRef,
    remainingSec,
    hasDirect,
    hasShared,
    liveMessage,
    notify,
    handleRegenerateCode,
    finishAndResetKiosk,
  } = useKioskConnection();

  const {
    cart,
    paymentStatus,
    orderNumber,
    orderDetails,
    pendingRemoteDineType,
    chooseDineType,
    addItemToCart,
    changeQty,
    removeItem,
    clearCart,
    totalPrice,
    totalCount,
    handleCheckoutClick,
    startPayment,
    requestRemoteCheckout,
    approveRemoteCheckout,
    declineRemoteCheckout,
  } = useCart({ t, notify, finishAndResetKiosk, kioskCodeRef, kioskLang });

  // 고대비 모드는 키오스크 영역뿐 아니라 페이지 바깥 여백(body)에도 적용
  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast-mode", highContrast);
    document.body.classList.toggle("high-contrast-mode", highContrast);
  }, [highContrast]);

  const [activeCategory, setActiveCategory] = useState("burger");
  const [menuSearch, setMenuSearch] = useState("");
  const [optionsFor, setOptionsFor] = useState(null);
  const [draftOptions, setDraftOptions] = useState(DEFAULT_OPTIONS);

  useEffect(() => {
    const onVoiceOrderReceived = ({ itemId, options }) => {
      const item = MENU.find((m) => m.id === itemId);
      if (!item || !t) return;

      // options가 없거나 이상한 값으로 오는 경우(위조/구버전 클라이언트 등)에도
      // computeUnitPrice에서 options.size 등을 읽다가 죽지 않도록 항상 객체로 보정
      const safeOptions = options && typeof options === "object" ? options : {};
      const finalOptions = FIXED_ICE_IDS.includes(item.id) ? { ...safeOptions, hotIce: "hot" } : { ...DEFAULT_OPTIONS, ...safeOptions };
      setActiveCategory(item.category);

      // 음성으로 옵션까지 말했으면 그 옵션으로, 메뉴 이름만 말했으면 기본 옵션으로
      // 바로 장바구니에 담음 — 옵션 선택 화면을 또 띄우면 음성으로 다 말했는데도
      // 한 번 더 화면을 봐야 해서 음성 주문의 장점이 없어짐
      addItemToCart(item, finalOptions);
    };

    socket.on("voice-order-received", onVoiceOrderReceived);
    return () => socket.off("voice-order-received", onVoiceOrderReceived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  useEffect(() => {
    const onCheckoutRequested = ({ dineType }) => {
      requestRemoteCheckout(dineType);
    };
    socket.on("checkout-requested-by-remote", onCheckoutRequested);
    return () => socket.off("checkout-requested-by-remote", onCheckoutRequested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

  const normalizedSearch = menuSearch.trim().toLocaleLowerCase();
  const filteredMenu = MENU.filter((item) => {
    if (normalizedSearch) {
      const searchableNames = [
        t?.menu?.[item.id],
        ...Object.values(item.names || {}),
        item.id,
      ].filter(Boolean).map((name) => String(name).toLocaleLowerCase());
      return searchableNames.some((name) => name.includes(normalizedSearch));
    }
    return item.category === activeCategory;
  });
  const receiptLang = orderDetails?.language || kioskLang;
  const receiptText = {
    ko: { done: "결제 완료!", order: "주문번호 {n}", dine: "이용 방법", dineIn: "매장 식사", takeout: "포장", payment: "결제 방법", card: "카드", cash: "현금", total: "주문 금액" },
    en: { done: "Payment complete!", order: "Order number {n}", dine: "Order type", dineIn: "Dine in", takeout: "Takeout", payment: "Payment method", card: "Card", cash: "Cash", total: "Order total" },
    zh: { done: "付款完成！", order: "订单号 {n}", dine: "用餐方式", dineIn: "堂食", takeout: "外带", payment: "支付方式", card: "银行卡", cash: "现金", total: "订单金额" },
    ja: { done: "お支払い完了！", order: "注文番号 {n}", dine: "ご利用方法", dineIn: "店内飲食", takeout: "テイクアウト", payment: "お支払い方法", card: "カード", cash: "現金", total: "注文金額" },
    vi: { done: "Thanh toán thành công!", order: "Số đơn hàng {n}", dine: "Hình thức", dineIn: "Dùng tại chỗ", takeout: "Mang đi", payment: "Phương thức thanh toán", card: "Thẻ", cash: "Tiền mặt", total: "Tổng đơn hàng" },
  }[receiptLang] || {
    done: "결제 완료!", order: "주문번호 {n}", dine: "이용 방법", dineIn: "매장 식사", takeout: "포장", payment: "결제 방법", card: "카드", cash: "현금", total: "주문 금액"
  };
  const searchResultText = {
    ko: filteredMenu.length ? `${filteredMenu.length}개의 메뉴를 찾았습니다. 메뉴를 누르면 옵션을 고르고 장바구니에 담을 수 있습니다.` : "검색 결과가 없습니다. 메뉴 이름을 다시 확인해 주세요.",
    en: filteredMenu.length ? `${filteredMenu.length} menu(s) found. Select a menu to choose options and add it to your cart.` : "No results found. Please check the menu name and try again.",
    zh: filteredMenu.length ? `找到 ${filteredMenu.length} 个菜单。点击菜单选择选项并加入购物车。` : "没有找到菜单，请检查名称后重试。",
    ja: filteredMenu.length ? `${filteredMenu.length}件のメニューが見つかりました。メニューを選択してオプションを選び、カートに追加できます。` : "検索結果がありません。メニュー名を確認してください。",
    vi: filteredMenu.length ? `Tìm thấy ${filteredMenu.length} món. Chọn món để tùy chỉnh và thêm vào giỏ hàng.` : "Không tìm thấy món. Vui lòng kiểm tra lại tên món.",
  }[kioskLang] || "검색 결과가 없습니다.";

  const handleCategoryClick = (cat) => {
    setActiveCategory(cat);
    notify(CATEGORY_LABELS[cat]?.ko || cat);
  };

  const openOptions = (item) => {
    setOptionsFor(item);
    setDraftOptions(DEFAULT_OPTIONS);
    notify(t.menu[item.id]);
  };

  const closeOptions = () => setOptionsFor(null);

  // 옵션 창이 열려있을 때 Esc로도 닫을 수 있게 (키보드/스크린리더 사용자를 위한 표준 동작)
  useEffect(() => {
    if (!optionsFor) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeOptions();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [optionsFor]);

  const confirmAddToCart = () => {
    if (!optionsFor) return;
    addItemToCart(optionsFor, draftOptions);
    closeOptions();
  };

  const choosePaymentMethod = (method) => startPayment(method, pendingRemoteDineType);

  // GitHub Pages는 /123456 같은 경로 새로고침이 404라서 코드를 ?code= 쿼리로 넘김
  const qrValue = kioskCode ? `${REMOTE_SITE_URL.replace(/\/+$/, "")}/?code=${kioskCode}` : "";

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!t) {
    return (
      <div className="kiosk">
        <div className="kiosk-card">
          <p className="subtitle">{FALLBACK_LOADING_TEXT}</p>
        </div>
      </div>
    );
  }

  const isHotIceAvailable = optionsFor ? !FIXED_ICE_IDS.includes(optionsFor.id) : false;

  return (
    <div className={`kiosk ${largeText ? "large" : ""} ${highContrast ? "high-contrast" : ""}`}>
      <div className="kiosk-card wide">
        <h1>{{ ko: "버거킹 키오스크", en: "Burger King Kiosk", zh: "汉堡王自助点餐机", ja: "バーガーキングのキオスク", vi: "Ki-ốt Burger King" }[kioskLang] || "버거킹 키오스크"}</h1>
        <p className="subtitle">{t.subtitle}</p>
        <form
          role="search"
          aria-label={({ko:"메뉴 검색",en:"Menu search",zh:"菜单搜索",ja:"メニュー検索",vi:"Tìm kiếm thực đơn"}[kioskLang] || "메뉴 검색")}
          onSubmit={(e) => {
            e.preventDefault();
            const results = document.getElementById("menu-search-results");
            if (results) results.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          style={{
            position: "sticky",
            top: "8px",
            zIndex: 100,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
            width: "100%",
            margin: "12px 0 22px",
            padding: "16px",
            boxSizing: "border-box",
            border: "4px solid #b45309",
            borderRadius: "14px",
            background: "#fff7ed",
            boxShadow: "0 4px 18px rgba(0,0,0,.35)",
          }}
        >
          <label htmlFor="menu-search-input" style={{ width: "100%", color: "#111827", fontSize: "22px", fontWeight: 900 }}>
            🔎 {({ko:"메뉴 검색 — 메뉴 이름을 입력하세요",en:"Menu search — enter a menu name",zh:"菜单搜索 — 输入菜单名称",ja:"メニュー検索 — メニュー名を入力してください",vi:"Tìm món — nhập tên món ăn"}[kioskLang] || "메뉴 검색 — 메뉴 이름을 입력하세요")}
          </label>
          <input
            id="menu-search-input"
            type="search"
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
            placeholder={({ko:"와퍼, 불고기버거, 콜라 등",en:"Whopper, bulgogi burger, cola, etc.",zh:"皇堡、韩式烤肉汉堡、可乐等",ja:"ワッパー、プルコギバーガー、コーラなど",vi:"Whopper, burger Bulgogi, cola, v.v."}[kioskLang] || "와퍼, 불고기버거, 콜라 등")}
            autoComplete="off"
            style={{
              flex: "1 1 220px",
              minWidth: 0,
              minHeight: "62px",
              padding: "12px 16px",
              border: "3px solid #111827",
              borderRadius: "10px",
              background: "#ffffff",
              color: "#111827",
              fontSize: "20px",
              fontWeight: 800,
              boxSizing: "border-box",
            }}
          />
          <button type="submit" style={{
            minHeight: "62px", padding: "12px 28px", border: "3px solid #111827",
            borderRadius: "10px", background: "#111827", color: "#ffffff",
            fontSize: "20px", fontWeight: 900, cursor: "pointer",
          }}>{({ko:"검색",en:"Search",zh:"搜索",ja:"検索",vi:"Tìm kiếm"}[kioskLang] || "검색")}</button>
          <button type="button" onClick={() => setMenuSearch("")} style={{
            minHeight: "62px", padding: "12px 20px", border: "3px solid #374151",
            borderRadius: "10px", background: "#ffffff", color: "#111827",
            fontSize: "18px", fontWeight: 900, cursor: "pointer",
          }}>{({ko:"전체 메뉴",en:"All menus",zh:"全部菜单",ja:"すべてのメニュー",vi:"Tất cả món"}[kioskLang] || "전체 메뉴")}</button>
        </form>
        <section aria-label="언어 선택" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "12px", width: "100%", margin: "16px auto", padding: "14px", boxSizing: "border-box", border: "2px solid #64748b", borderRadius: "14px", background: highContrast ? "#000000" : "#f1f5f9" }}>
          <label htmlFor="kiosk-language-select" style={{ fontSize: "20px", fontWeight: 900, color: highContrast ? "#ffffff" : "#111827" }}>
            {(LANGUAGE_LABELS[kioskLang] || LANGUAGE_LABELS.ko).title}
          </label>
          <select id="kiosk-language-select" value={kioskLang} onChange={(e) => setKioskLang(e.target.value)} style={{ minHeight: "54px", minWidth: "190px", padding: "10px 16px", border: "3px solid #111827", borderRadius: "10px", background: "#ffffff", color: "#111827", fontSize: "19px", fontWeight: 800 }}>
            {LANGUAGE_OPTIONS.map((lang) => <option key={lang} value={lang}>{(LANGUAGE_LABELS[kioskLang] || LANGUAGE_LABELS.ko).options[lang]}</option>)}
          </select>
        </section>

        <section
          aria-label={({ko:"접근성 설정",en:"Accessibility settings",zh:"无障碍设置",ja:"アクセシビリティ設定",vi:"Cài đặt trợ năng"}[kioskLang] || "접근성 설정")}
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            width: "100%",
            margin: "18px auto 22px",
            padding: "14px",
            boxSizing: "border-box",
            border: "2px solid #64748b",
            borderRadius: "14px",
            background: highContrast ? "#000000" : "#f1f5f9",
          }}
        >
          <strong style={{ width: "100%", textAlign: "center", fontSize: "18px", color: highContrast ? "#ffffff" : "#111827" }}>
            {({ko:"접근성 설정",en:"Accessibility settings",zh:"无障碍设置",ja:"アクセシビリティ設定",vi:"Cài đặt trợ năng"}[kioskLang] || "접근성 설정")}
          </strong>
          <button
            type="button"
            className="large-text-toggle"
            aria-pressed={largeText}
            onClick={() => setLargeText((current) => !current)}
            style={{
              display: "inline-flex",
              visibility: "visible",
              opacity: 1,
              minHeight: "56px",
              padding: "12px 20px",
              border: "3px solid #111827",
              borderRadius: "10px",
              background: "#ffffff",
              color: "#111827",
              fontSize: "18px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {(LARGE_TEXT_LABELS[kioskLang] || LARGE_TEXT_LABELS.ko)[largeText ? "off" : "on"]}
          </button>
          <button
            type="button"
            className="contrast-toggle"
            aria-pressed={highContrast}
            onClick={() => setHighContrast((current) => !current)}
            style={{
              display: "inline-flex",
              visibility: "visible",
              opacity: 1,
              minHeight: "56px",
              padding: "12px 20px",
              border: "3px solid #111827",
              borderRadius: "10px",
              background: highContrast ? "#ffd400" : "#111827",
              color: highContrast ? "#000000" : "#ffffff",
              fontSize: "18px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {(HIGH_CONTRAST_LABELS[kioskLang] || HIGH_CONTRAST_LABELS.ko)[highContrast ? "off" : "on"]}
          </button>
        </section>

        {/* 원격/공유 참가자가 붙어 있는 동안엔 항상 켜져 있는 표시등 —
            악용(누군가 몰래 연결) 방지를 위해 연결 여부를 화면에서 계속 알 수 있게 함.
            조건부로 마운트/언마운트하면 화면을 읽어주는 프로그램이 새로 생긴 live
            region의 내용을 못 읽는 경우가 있어서, 요소는 항상 그대로 두고 내용만
            비웠다 채움. 단, React는 빈 문자열도 빈 텍스트 노드로 렌더링해서 CSS
            :empty로는 못 숨기므로(패딩만 남은 빨간 동그라미가 계속 보임), 연결
            여부에 따라 보이기용 클래스를 따로 켜고 끔 */}
        <p
          className={`remote-connected-indicator${hasDirect || hasShared ? "" : " remote-connected-indicator-off"}`}
          role="status"
          aria-live="polite"
        >
          {(hasDirect || hasShared) ? t.remoteConnectedIndicator : ""}
        </p>

        <div className="code-box">
          <div className="qr-wrap">
            {kioskCode ? (
              <img src={getQrImageUrl(qrValue)} alt={t.codeLabel} width={90} height={90} />
            ) : (
              <div style={{ width: 90, height: 90 }} />
            )}
          </div>
          <div className="code-info">
            <p className="code-label">{t.codeLabel}</p>
            <p className="code-number">{kioskCode || "------"}</p>
            <p className={`code-timer ${remainingSec <= 30 ? "warning" : ""}`}>
              <span aria-hidden="true">⏱️</span> {formatTime(remainingSec)} {t.expireSuffix}
            </p>
            <button className="refresh-btn" onClick={handleRegenerateCode}>{t.refreshBtn}</button>
          </div>
        </div>

        <div className="layout">
          <div className="menu-section">
{normalizedSearch && <p id="menu-search-results" role="status" style={{ margin: "0 0 12px", padding: "12px", borderRadius: "10px", background: "#fff7ed", color: "#111827", fontWeight: 800 }}>{searchResultText}</p>}
            {!normalizedSearch && <div className="tabs">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  className={`tab ${activeCategory === cat ? "active" : ""}`}
                  aria-pressed={activeCategory === cat}
                  onClick={() => handleCategoryClick(cat)}
                >
                  {CATEGORY_LABELS[cat]?.[kioskLang] || CATEGORY_LABELS[cat]?.ko || cat}
                </button>
              ))}
            </div>}

            <div className="menu-grid">
              {filteredMenu.map((item) => (
                <button key={item.id} className={`menu-item ${easyMode ? "easy" : ""}`} onClick={() => openOptions(item)}>
                  <span className="menu-photo-wrap">
                    <img
                      className="menu-photo"
                      src={getMenuImageUrl(item)}
                      alt={t.menu[item.id]}
                      onError={(e) => {
                        e.target.style.display = "none";
                        e.target.nextSibling.style.display = "block";
                      }}
                    />
                    <span className="menu-photo-fallback" style={{ display: "none" }}>{item.icon}</span>
                  </span>
                  <span className="menu-name">{t.menu[item.id]}</span>
                  <span className="menu-price">{item.price.toLocaleString()}원~</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cart-panel">
            <div className="cart-header">
              {/* 주문 수량은 비어 있어도 0으로 표시 */}
              <h2>{t.cartTitle} <span className="cart-badge">{totalCount}</span></h2>
              {cart.length > 0 && <button className="clear-btn" onClick={clearCart}>{t.clearBtn}</button>}
            </div>

            {cart.length === 0 ? (
              <p className="cart-empty">{t.cartEmpty}</p>
            ) : (
              <div className="cart-list">
                {cart.map((c) => {
                  const menuItem = MENU.find((m) => m.id === c.id);
                  const summary = buildOptionSummary(t, c.options, menuItem);
                  return (
                    <div key={c.cartId} className="cart-item">
                      <div className="cart-item-info">
                        <span className="cart-item-icon">{menuItem?.icon}</span>
                        <div>
                          <p className="cart-item-name">{t.menu[c.id]}</p>
                          {summary && <p className="cart-item-options">{summary}</p>}
                          <p className="cart-item-price">{c.unitPrice.toLocaleString()}원</p>
                        </div>
                      </div>
                      <div className="cart-item-actions">
                        <div className="qty-controls">
                          <button aria-label={t.qtyDecreaseLabel} onClick={() => changeQty(c.cartId, -1)}>-</button>
                          <span>{c.qty}</span>
                          <button aria-label={t.qtyIncreaseLabel} onClick={() => changeQty(c.cartId, 1)}>+</button>
                        </div>
                        <button className="remove-btn" aria-label={t.removeItemLabel} onClick={() => removeItem(c.cartId)}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="cart-footer">
              <div className="total-row">
                <span>{format(t.totalCountLabel, { n: totalCount })}</span>
                <span className="total-price">{totalPrice.toLocaleString()}원</span>
              </div>
              <button className="checkout-btn" onClick={handleCheckoutClick} disabled={cart.length === 0}>
                {t.checkoutBtn}
              </button>
            </div>
          </div>
        </div>
      </div>

      {optionsFor && (
        <div className="payment-overlay" onClick={closeOptions}>
          <div
            className="options-box"
            role="dialog"
            aria-modal="true"
            aria-label={t.menu[optionsFor.id]}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="options-close-btn" onClick={closeOptions} aria-label={t.closeBtn}>✕</button>
            <div className="options-header">
              <span className="options-icon">{optionsFor.icon}</span>
              <h3>{t.menu[optionsFor.id]}</h3>
            </div>
            <img className="options-menu-photo" src={getMenuImageUrl(optionsFor)} alt={t.menu[optionsFor.id]} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <p className="options-menu-detail">{{ko:"기본 가격",en:"Base price",zh:"基础价格",ja:"基本価格",vi:"Giá cơ bản"}[kioskLang] || "기본 가격"}: ₩{optionsFor.price.toLocaleString()} · {{ko:"옵션을 선택하면 가격이 바뀝니다.",en:"Price changes with options.",zh:"选择选项后价格会变化。",ja:"オプションにより価格が変わります。",vi:"Giá thay đổi theo tùy chọn."}[kioskLang] || "옵션을 선택하면 가격이 바뀝니다."}</p>

            {isHotIceAvailable && (
              <div className="options-group">
                <p className="options-group-label">{t.hotIceLabel}</p>
                <div className="options-choice-row">
                  <button
                    className={`option-choice ${draftOptions.hotIce === "hot" ? "selected" : ""}`}
                    onClick={() => { setDraftOptions((prev) => ({ ...prev, hotIce: "hot" })); notify(t.hotOption); }}
                  >
                    {t.hotOption}
                  </button>
                  <button
                    className={`option-choice ${draftOptions.hotIce === "ice" ? "selected" : ""}`}
                    onClick={() => { setDraftOptions((prev) => ({ ...prev, hotIce: "ice" })); notify(t.iceOption); }}
                  >
                    {t.iceOption}
                  </button>
                </div>
              </div>
            )}

            {(<div className="options-group">
              <p className="options-group-label">{t.sizeLabel}</p>
              <div className="options-choice-row">
                <button
                  className={`option-choice ${draftOptions.size === "regular" ? "selected" : ""}`}
                  onClick={() => { setDraftOptions((prev) => ({ ...prev, size: "regular" })); notify(t.sizeRegular); }}
                >
                  {t.sizeRegular}
                </button>
                <button
                  className={`option-choice ${draftOptions.size === "large" ? "selected" : ""}`}
                  onClick={() => { setDraftOptions((prev) => ({ ...prev, size: "large" })); notify(t.sizeLarge.replace(/\s*\(.*\)/, "")); }}
                >
                  {t.sizeLarge}
                </button>
              </div>
            </div>)}

            {/* 음료 외 카페식 토핑 옵션은 사용하지 않습니다. */}
            

            

            <div className="options-price-row">
              <span>{computeUnitPrice(optionsFor, draftOptions).toLocaleString()}원</span>
            </div>

            <button className="checkout-btn" onClick={confirmAddToCart}>{t.addToCartBtn}</button>
          </div>
        </div>
      )}

      {paymentStatus === "choosing-dine-type" && (
        <div className="payment-overlay">
          <div className="dine-type-box" role="dialog" aria-modal="true" aria-label={t.dineTypeTitle}>
            <h3>{t.dineTypeTitle}</h3>
            <div className="dine-type-choices">
              <button className="dine-type-btn" onClick={() => { notify(t.dineIn); chooseDineType("dine-in"); }}>🍽️ {t.dineIn}</button>
              <button className="dine-type-btn" onClick={() => { notify(t.takeout); chooseDineType("takeout"); }}>🥤 {t.takeout}</button>
            </div>
          </div>
        </div>
      )}

      {paymentStatus === "choosing-payment" && (
        <div className="payment-overlay">
          <div className="dine-type-box" role="dialog" aria-modal="true" aria-label={({ko:"결제 방법 선택",en:"Choose a payment method",zh:"选择支付方式",ja:"お支払い方法を選択",vi:"Chọn phương thức thanh toán"}[kioskLang] || "결제 방법 선택")}>
            <h3>{({ko:"결제 방법을 선택하세요",en:"Choose a payment method",zh:"请选择支付方式",ja:"お支払い方法を選択してください",vi:"Vui lòng chọn phương thức thanh toán"}[kioskLang] || "결제 방법을 선택하세요")}</h3>
            <p className="subtitle">{({ko:"실제 결제는 카드 단말기 또는 현금으로 진행해 주세요.",en:"Complete the actual payment at the card terminal or with cash.",zh:"请使用刷卡终端或现金完成实际付款。",ja:"実際のお支払いはカード端末または現金で行ってください。",vi:"Vui lòng thanh toán thực tế bằng máy quẹt thẻ hoặc tiền mặt."}[kioskLang] || "실제 결제는 카드 단말기 또는 현금으로 진행해 주세요.")}</p>
            <div className="dine-type-choices">
              <button className="dine-type-btn" onClick={() => choosePaymentMethod("cash")}>💵 {({ko:"현금",en:"Cash",zh:"现金",ja:"現金",vi:"Tiền mặt"}[kioskLang] || "현금")}</button>
              <button className="dine-type-btn" onClick={() => choosePaymentMethod("card")}>💳 {({ko:"카드",en:"Card",zh:"银行卡",ja:"カード",vi:"Thẻ"}[kioskLang] || "카드")}</button>
            </div>
          </div>
        </div>
      )}

      {paymentStatus === "confirm-remote" && (
        <div className="payment-overlay">
          <div
            className="dine-type-box"
            role="dialog"
            aria-modal="true"
            aria-label={t.remoteCheckoutConfirmTitle}
          >
            <h3>{t.remoteCheckoutConfirmTitle}</h3>
            <p>{t.remoteCheckoutConfirmDesc}</p>
            {pendingRemoteDineType && (
              <p className="subtitle">
                {pendingRemoteDineType === "dine-in" ? `🍽️ ${t.dineIn}` : `🥤 ${t.takeout}`}
              </p>
            )}
            <div className="dine-type-choices">
              <button className="checkout-btn" onClick={approveRemoteCheckout}>{t.confirmBtn}</button>
              <button className="refresh-btn" onClick={declineRemoteCheckout}>{t.cancelBtn}</button>
            </div>
          </div>
        </div>
      )}

      {paymentStatus === "processing" && (
        <div className="payment-overlay">
          <div className="payment-box" role="alert" aria-live="assertive">
            <div className="spinner" aria-hidden="true" />
            <p>{t.processingLabel}</p>
          </div>
        </div>
      )}

      {paymentStatus === "done" && (
        <div className="payment-overlay">
          <div className="payment-box success" role="alert" aria-live="assertive">
            <span className="check-icon" aria-hidden="true">✅</span>
            <p className="success-title">{receiptText.done}</p>
            <p className="order-number">{receiptText.order.replace("{n}", orderNumber)}</p>
            {orderDetails && (
              <div className="completed-order-details">
                <p>{receiptText.dine}: {orderDetails.dineType === "dine-in" ? receiptText.dineIn : receiptText.takeout}</p>
                <p>{receiptText.payment}: {orderDetails.paymentMethod === "card" ? receiptText.card : receiptText.cash}</p>
                <p>{receiptText.total}: ₩{orderDetails.totalPrice.toLocaleString()}</p>
                <ul>
                  {orderDetails.items.map((item) => {
                    const menuItem = MENU.find((menu) => menu.id === item.id);
                    return <li key={item.cartId}>{menuItem?.names?.[receiptLang] || menuItem?.names?.ko || item.id} × {item.qty}</li>;
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 화면엔 안 보이지만 스크린리더에게 방금 일어난 일(메뉴 선택, 옵션 변경 등)을 알려줌 */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</div>
    </div>
  );
}
