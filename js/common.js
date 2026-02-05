/**
 * 全站 Pjax：无刷新秒开导航
 * - 拦截本站 .php 链接，fetch 后仅替换 #main-content 并更新 title
 * - 顶部红色 Loading Bar、pushState、popstate、新内容内 script 执行、公共 CSS 去重
 */
(function() {
    'use strict';

    var MAIN_CONTENT_ID = 'main-content';
    var LOADING_BAR_ID = 'pjax-loading-bar';
    var SKIP_PJAX_PAGES = ['index.php', 'reset-password.php', 'owner_secondary_password.php', 'login_process.php'];
    var LOADING_BAR_DURATION = 280;

    function getLoadingBar() {
        var bar = document.getElementById(LOADING_BAR_ID);
        if (bar) return bar;
        bar = document.createElement('div');
        bar.id = LOADING_BAR_ID;
        bar.setAttribute('aria-hidden', 'true');
        bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;background:#e53935;z-index:99999;width:0;transition:width 0.15s ease-out;pointer-events:none;';
        document.body.appendChild(bar);
        return bar;
    }

    function showLoadingBar() {
        var bar = getLoadingBar();
        bar.style.width = '30%';
        bar.style.transition = 'width 0.15s ease-out';
        clearTimeout(bar._pjaxTimer);
        bar._pjaxTimer = setTimeout(function() {
            bar.style.width = '70%';
            bar.style.transition = 'width 0.2s ease-out';
        }, 100);
    }

    function hideLoadingBar() {
        var bar = document.getElementById(LOADING_BAR_ID);
        if (!bar) return;
        clearTimeout(bar._pjaxTimer);
        bar.style.width = '100%';
        bar.style.transition = 'width 0.12s ease-out';
        setTimeout(function() {
            bar.style.width = '0';
            bar.style.transition = 'width 0.08s ease-out';
        }, 120);
    }

    function isSameOrigin(href) {
        try {
            var a = document.createElement('a');
            a.href = href;
            return a.origin === window.location.origin;
        } catch (e) {
            return false;
        }
    }

    function isPhpLink(href) {
        if (!href || href.indexOf('javascript:') === 0 || href === '#' || href === '') return false;
        var path = href.split('?')[0];
        return path.indexOf('.php') !== -1 || path.slice(-1) === '/' || (path.indexOf('.') === -1 && path.length > 0);
    }

    function shouldSkipPjax(url) {
        var path = (url || '').split('?')[0];
        var base = path.split('/').pop() || path;
        return SKIP_PJAX_PAGES.some(function(p) { return base === p || path.indexOf(p) !== -1; });
    }

    function normalizeAssetKey(urlOrPath) {
        if (!urlOrPath) return '';
        try {
            var u = new URL(urlOrPath, window.location.href);
            var path = u.pathname || '';
            var segs = path.split('/').filter(Boolean);
            return segs.length ? segs[segs.length - 1] : path;
        } catch (e) {
            var p = (urlOrPath + '').split('?')[0];
            var segs = p.split('/').filter(Boolean);
            return segs.length ? segs[segs.length - 1] : p;
        }
    }

    function getExistingStyleHrefs() {
        var hrefs = [];
        document.querySelectorAll('link[rel="stylesheet"]').forEach(function(link) {
            var h = link.getAttribute('href');
            if (h) hrefs.push(normalizeAssetKey(h));
        });
        return hrefs;
    }

    function getExistingScriptSrcs() {
        var srcs = [];
        document.querySelectorAll('script[src]').forEach(function(script) {
            var s = script.getAttribute('src');
            if (s) srcs.push(normalizeAssetKey(s));
        });
        return srcs;
    }

    function parseHtml(html) {
        var doc = document.implementation.createHTMLDocument('');
        doc.open();
        doc.write(html);
        doc.close();
        return doc;
    }

    function extractMainContent(doc) {
        var el = doc.getElementById(MAIN_CONTENT_ID);
        return el ? el : null;
    }

    function extractTitle(doc) {
        var titleEl = doc.querySelector('title');
        return titleEl ? titleEl.textContent.trim() : document.title;
    }

    function injectStyles(fragment, existingHrefs) {
        fragment.querySelectorAll('link[rel="stylesheet"]').forEach(function(link) {
            var href = link.getAttribute('href');
            if (!href || existingHrefs.indexOf(normalizeAssetKey(href)) !== -1) return;
            var clone = link.cloneNode(true);
            document.head.appendChild(clone);
        });
    }

    function runScripts(container, existingSrcs) {
        container.querySelectorAll('script').forEach(function(oldScript) {
            var src = oldScript.getAttribute('src');
            if (src) {
                var key = normalizeAssetKey(src);
                if (existingSrcs.indexOf(key) !== -1) return;
                var script = document.createElement('script');
                script.src = src;
                if (oldScript.async) script.async = true;
                if (oldScript.defer) script.defer = true;
                document.body.appendChild(script);
            } else {
                var inline = document.createElement('script');
                inline.textContent = oldScript.textContent;
                document.body.appendChild(inline);
                inline.parentNode.removeChild(inline);
            }
        });
    }

    function updateSidebarActive() {
        if (typeof window.setCurrentPageHighlight === 'function') {
            window.setCurrentPageHighlight();
        }
    }

    function doReplace(html, url) {
        var doc = parseHtml(html);
        var newMain = extractMainContent(doc);
        var currentMain = document.getElementById(MAIN_CONTENT_ID);

        if (!newMain) {
            window.location.href = url;
            return;
        }
        if (!currentMain) {
            var wrapper = document.createElement('div');
            wrapper.id = MAIN_CONTENT_ID;
            document.body.appendChild(wrapper);
            currentMain = wrapper;
        }

        var newTitle = extractTitle(doc);
        document.title = newTitle;

        var existingHrefs = getExistingStyleHrefs();
        var existingSrcs = getExistingScriptSrcs();

        injectStyles(newMain, existingHrefs);
        currentMain.innerHTML = newMain.innerHTML;
        runScripts(currentMain, existingSrcs);
        updateSidebarActive();
    }

    function pjaxNavigate(url, pushState) {
        if (pushState === undefined) pushState = true;
        showLoadingBar();
        var fullUrl = (typeof url === 'string' && url.indexOf('http') === 0) ? url : (function() {
            try { return new URL(url, window.location.href).href; } catch (e) { return url; }
        })();
        fetch(fullUrl, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function(res) {
                if (!res.ok) throw new Error(res.statusText);
                return res.text();
            })
            .then(function(html) {
                doReplace(html, fullUrl);
                if (pushState) {
                    window.history.pushState({ pjax: true, url: fullUrl }, '', fullUrl);
                }
            })
            .catch(function() {
                window.location.href = fullUrl;
            })
            .then(function() {
                hideLoadingBar();
            });
    }

    function handleClick(e) {
        var target = e.target;
        while (target && target.nodeName !== 'A') target = target.parentElement;
        if (!target || target.nodeName !== 'A') return;
        var href = target.getAttribute('href');
        if (!href || !isPhpLink(href) || !isSameOrigin(href)) return;
        if (target.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
        if (shouldSkipPjax(href)) return;
        e.preventDefault();
        var url;
        try {
            url = new URL(href, window.location.href).href;
        } catch (err) {
            url = href;
        }
        pjaxNavigate(url);
    }

    function handlePopState(e) {
        if (e.state && e.state.pjax && e.state.url) {
            pjaxNavigate(e.state.url, false);
        }
    }

    document.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', handlePopState);

    window.pjaxNavigate = pjaxNavigate;
})();
