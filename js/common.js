/**
 * 全站 Pjax 无刷新导航
 * - 拦截本站 .php 链接点击，使用 fetch 拉取并局部替换 #main-content
 * - 更新 title、pushState、前进/后退支持
 * - 顶部红色加载条、新脚本执行、公共 CSS 去重
 */
(function () {
    'use strict';

    var MAIN_CONTENT_ID = 'main-content';
    var LOADING_BAR_ID = 'pjax-loading-bar';
    var PAGES_WITHOUT_MAIN_CONTENT = ['index.php', 'reset-password.php', 'owner_secondary_password.php', 'login_process.php'];
    var progressTimer = null;
    var CACHE_MAX = 20;
    var pjaxCache = {};

    function getLoadingBar() {
        var bar = document.getElementById(LOADING_BAR_ID);
        if (bar) return bar;
        var style = document.createElement('style');
        style.textContent = [
            '#' + LOADING_BAR_ID + '{',
            '  position:fixed;top:0;left:0;width:0;height:3px;background:#e53935;z-index:99999;',
            '  transition:width .12s ease-out,opacity .15s ease-out;',
            '}',
            '#' + LOADING_BAR_ID + '.done{ opacity:0; width:100% !important; }'
        ].join('');
        document.head.appendChild(style);
        bar = document.createElement('div');
        bar.id = LOADING_BAR_ID;
        document.body.appendChild(bar);
        return bar;
    }

    function stopFakeProgress() {
        if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
        }
    }

    function showLoadingBar() {
        stopFakeProgress();
        var bar = getLoadingBar();
        bar.style.transition = 'width .12s ease-out';
        bar.style.width = '0%';
        bar.style.opacity = '1';
        bar.classList.remove('done');
        bar.offsetHeight;
        var start = 0;
        var target = 88;
        var step = 4;
        var interval = 35;
        progressTimer = setInterval(function () {
            start += step;
            if (start >= target) {
                start = target;
                stopFakeProgress();
            }
            bar.style.width = start + '%';
        }, interval);
    }

    function hideLoadingBar() {
        stopFakeProgress();
        var bar = document.getElementById(LOADING_BAR_ID);
        if (!bar) return;
        bar.style.width = '100%';
        bar.classList.add('done');
        setTimeout(function () {
            bar.style.width = '0';
            bar.style.opacity = '0';
            bar.classList.remove('done');
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
        if (!href || typeof href !== 'string') return false;
        var path = href.split('?')[0];
        return /\.php$/i.test(path);
    }

    function shouldFullLoad(url) {
        var path = (url || '').split('?')[0];
        var name = path.split('/').pop() || path;
        return PAGES_WITHOUT_MAIN_CONTENT.some(function (p) {
            return name === p || path.endsWith(p);
        });
    }

    function normalizeUrl(url) {
        var a = document.createElement('a');
        a.href = url;
        return a.href;
    }

    function addStylesFromDoc(doc) {
        var heads = doc.querySelectorAll('head link[rel="stylesheet"]');
        var existing = {};
        document.querySelectorAll('head link[rel="stylesheet"]').forEach(function (link) {
            var h = link.getAttribute('href') || '';
            existing[h] = true;
        });
        heads.forEach(function (link) {
            var href = link.getAttribute('href');
            if (!href || existing[href]) return;
            var fullHref = href.indexOf('http') === 0 ? href : normalizeUrl(new URL(href, window.location.href).href);
            if (existing[fullHref]) return;
            var clone = link.cloneNode(true);
            clone.setAttribute('href', fullHref);
            document.head.appendChild(clone);
            existing[href] = true;
            existing[fullHref] = true;
        });
    }

    function runScripts(container) {
        if (!container) return;
        var scripts = Array.prototype.slice.call(container.querySelectorAll('script'));
        scripts.forEach(function (oldScript) {
            var el = document.createElement('script');
            if (oldScript.src) {
                el.src = oldScript.src;
            } else {
                el.textContent = oldScript.textContent;
            }
            var attrs = ['async', 'defer'];
            attrs.forEach(function (a) {
                if (oldScript[a]) el[a] = true;
            });
            oldScript.parentNode.removeChild(oldScript);
            document.body.appendChild(el);
        });
    }

    function extractMainContentAndTitle(html, url) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var main = doc.getElementById(MAIN_CONTENT_ID);
        var titleEl = doc.querySelector('title');
        var title = titleEl ? titleEl.textContent.trim() : document.title;
        return {
            mainHtml: main ? main.innerHTML : null,
            title: title,
            doc: doc
        };
    }

    function doReplace(payload) {
        var container = document.getElementById(MAIN_CONTENT_ID);
        if (!container) return false;
        if (payload.title) document.title = payload.title;
        container.innerHTML = payload.mainHtml || '';
        runScripts(container);
        return true;
    }

    function applyCacheAndReplace(cached, url, push) {
        if (!cached || !cached.mainHtml) return false;
        addStylesFromDoc(cached.doc);
        doReplace({ mainHtml: cached.mainHtml, title: cached.title });
        if (push) {
            try {
                window.history.pushState({}, cached.title || '', url);
            } catch (e) {
                window.history.pushState({}, '', url);
            }
        }
        document.title = cached.title || document.title;
        window.dispatchEvent(new CustomEvent('pjax:complete', { detail: { url: url } }));
        return true;
    }

    function setCache(url, data) {
        var keys = Object.keys(pjaxCache);
        if (keys.length >= CACHE_MAX) {
            delete pjaxCache[keys[0]];
        }
        pjaxCache[url] = { mainHtml: data.mainHtml, title: data.title, doc: data.doc };
    }

    function navigate(url, push) {
        url = normalizeUrl(url);
        if (shouldFullLoad(url)) {
            window.location.href = url;
            return;
        }

        var currentMain = document.getElementById(MAIN_CONTENT_ID);
        if (!currentMain) {
            window.location.href = url;
            return;
        }

        var cached = pjaxCache[url];
        if (cached) {
            applyCacheAndReplace(cached, url, push);
            return;
        }

        showLoadingBar();
        fetch(url, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin'
        })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then(function (html) {
                var data = extractMainContentAndTitle(html, url);
                if (!data.mainHtml) {
                    window.location.href = url;
                    return;
                }
                setCache(url, data);
                applyCacheAndReplace(data, url, push);
            })
            .catch(function () {
                window.location.href = url;
            })
            .finally(function () {
                hideLoadingBar();
            });
    }

    window.pjaxNavigate = function (url) {
        if (!url) return;
        navigate(url, true);
    };

    document.addEventListener('click', function (e) {
        var a = e.target.closest('a');
        if (!a || a.getAttribute('target') === '_blank' || a.hasAttribute('download')) return;
        var href = a.getAttribute('href');
        if (!href || href.startsWith('#') || !isSameOrigin(href) || !isPhpLink(href)) return;
        if (!document.getElementById(MAIN_CONTENT_ID)) return;
        e.preventDefault();
        navigate(href, true);
    }, true);

    window.addEventListener('popstate', function () {
        navigate(window.location.href, false);
    });

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
