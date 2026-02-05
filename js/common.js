/**
 * 全站 Pjax：点击侧栏/链接无刷新切换，悬停预取实现“点即现”
 */
(function () {
    'use strict';

    var MAIN_CONTENT_ID = 'main-content';
    var LOADING_BAR_ID = 'pjax-loading-bar';
    var PAGES_FULL_LOAD = ['index.php', 'reset-password.php', 'owner_secondary_password.php', 'login_process.php'];
    var CACHE_MAX = 25;
    var pjaxCache = {};
    var progressTimer = null;

    function normalizeUrl(url) {
        var a = document.createElement('a');
        a.href = url;
        return a.href;
    }

    function getLoadingBar() {
        var bar = document.getElementById(LOADING_BAR_ID);
        if (bar) return bar;
        var style = document.createElement('style');
        style.textContent = '#' + LOADING_BAR_ID + '{position:fixed;top:0;left:0;width:0;height:3px;background:#e53935;z-index:99999;transition:width .12s ease-out,opacity .15s ease-out;}' +
            '#' + LOADING_BAR_ID + '.done{opacity:0;width:100%!important}';
        document.head.appendChild(style);
        bar = document.createElement('div');
        bar.id = LOADING_BAR_ID;
        document.body.appendChild(bar);
        return bar;
    }

    function stopFakeProgress() {
        if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    }

    function showLoadingBar() {
        stopFakeProgress();
        var bar = getLoadingBar();
        bar.style.width = '0%';
        bar.style.opacity = '1';
        bar.classList.remove('done');
        bar.offsetHeight;
        var n = 0;
        progressTimer = setInterval(function () {
            n += 4;
            if (n >= 88) { n = 88; stopFakeProgress(); }
            bar.style.width = n + '%';
        }, 35);
    }

    function hideLoadingBar() {
        stopFakeProgress();
        var bar = document.getElementById(LOADING_BAR_ID);
        if (!bar) return;
        bar.style.width = '100%';
        bar.classList.add('done');
        setTimeout(function () { bar.style.width = '0'; bar.style.opacity = '0'; bar.classList.remove('done'); }, 120);
    }

    function isSameOrigin(href) {
        try { var a = document.createElement('a'); a.href = href; return a.origin === window.location.origin; } catch (e) { return false; }
    }

    function isPhpLink(href) {
        return href && typeof href === 'string' && /\.php$/i.test((href.split('?')[0] || ''));
    }

    function shouldFullLoad(url) {
        var name = (url || '').split('?')[0].split('/').pop() || '';
        return PAGES_FULL_LOAD.some(function (p) { return name === p; });
    }

    function addStylesFromDoc(doc) {
        if (!doc) return;
        var existing = {};
        document.querySelectorAll('head link[rel="stylesheet"]').forEach(function (l) { existing[l.getAttribute('href') || ''] = true; });
        doc.querySelectorAll('head link[rel="stylesheet"]').forEach(function (link) {
            var href = link.getAttribute('href');
            if (!href || existing[href]) return;
            var full = href.indexOf('http') === 0 ? href : normalizeUrl(new URL(href, window.location.href).href);
            if (existing[full]) return;
            var clone = link.cloneNode(true);
            clone.setAttribute('href', full);
            document.head.appendChild(clone);
            existing[href] = existing[full] = true;
        });
    }

    function runScripts(container) {
        if (!container) return;
        var list = Array.prototype.slice.call(container.querySelectorAll('script'));
        list.forEach(function (old) {
            var el = document.createElement('script');
            if (old.src) el.src = old.src; else el.textContent = old.textContent;
            ['async', 'defer'].forEach(function (a) { if (old[a]) el[a] = true; });
            old.parentNode.removeChild(old);
            document.body.appendChild(el);
        });
    }

    function extractMain(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var main = doc.getElementById(MAIN_CONTENT_ID);
        var titleEl = doc.querySelector('title');
        return {
            mainHtml: main ? main.innerHTML : null,
            title: titleEl ? titleEl.textContent.trim() : '',
            doc: doc
        };
    }

    function setCache(url, data) {
        var keys = Object.keys(pjaxCache);
        if (keys.length >= CACHE_MAX) delete pjaxCache[keys[0]];
        pjaxCache[url] = { mainHtml: data.mainHtml, title: data.title, doc: data.doc };
    }

    function applyContent(cached, url, push) {
        if (!cached || !cached.mainHtml) return false;
        addStylesFromDoc(cached.doc);
        var container = document.getElementById(MAIN_CONTENT_ID);
        if (!container) return false;
        if (cached.title) document.title = cached.title;
        container.innerHTML = cached.mainHtml;
        runScripts(container);
        if (push) {
            try { window.history.pushState({}, cached.title || '', url); } catch (e) { window.history.pushState({}, '', url); }
        }
        window.dispatchEvent(new CustomEvent('pjax:complete', { detail: { url: url } }));
        return true;
    }

    /** 预取：后台拉取并写入缓存，不更新页面 */
    function prefetch(url) {
        url = normalizeUrl(url);
        if (shouldFullLoad(url) || pjaxCache[url]) return;
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.text() : Promise.reject(); })
            .then(function (html) {
                var data = extractMain(html);
                if (data.mainHtml) setCache(url, data);
            })
            .catch(function () {});
    }

    function navigate(url, push) {
        url = normalizeUrl(url);
        if (shouldFullLoad(url)) { window.location.href = url; return; }
        if (!document.getElementById(MAIN_CONTENT_ID)) { window.location.href = url; return; }

        var cached = pjaxCache[url];
        if (cached) {
            applyContent(cached, url, push);
            return;
        }

        showLoadingBar();
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error();
                return r.text();
            })
            .then(function (html) {
                var data = extractMain(html);
                if (!data.mainHtml) { window.location.href = url; return; }
                setCache(url, data);
                applyContent(data, url, push);
            })
            .catch(function () { window.location.href = url; })
            .finally(hideLoadingBar);
    }

    window.pjaxNavigate = function (url) {
        if (url) navigate(url, true);
    };

    document.addEventListener('click', function (e) {
        var a = e.target.closest('a');
        if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#' || !isSameOrigin(href) || !isPhpLink(href)) return;
        if (!document.getElementById(MAIN_CONTENT_ID)) return;
        e.preventDefault();
        navigate(href, true);
    }, true);

    window.addEventListener('popstate', function () {
        navigate(window.location.href, false);
    });

    /** 侧栏悬停预取：鼠标移入菜单项时预取该页，点击时直接从缓存显示 */
    document.addEventListener('mouseover', function (e) {
        var target = e.target.closest('.informationmenu-section-title[data-page], a.submenu-item[href*=".php"]');
        if (!target) return;
        var url = target.getAttribute('data-page') || target.getAttribute('href');
        if (url) prefetch(url);
    }, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            if (typeof setCurrentPageHighlight === 'function') setCurrentPageHighlight();
        });
    } else if (typeof setCurrentPageHighlight === 'function') {
        setCurrentPageHighlight();
    }
    window.addEventListener('pjax:complete', function () {
        if (typeof setCurrentPageHighlight === 'function') setCurrentPageHighlight();
    });
})();
