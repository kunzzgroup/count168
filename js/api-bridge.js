/**
 * 将原 PHP 相对路径解析为绝对 URL。
 * 若设置 window.__API_BASE_URL__（Spring Boot 根地址，无尾斜杠），则仅对已登记的路径走 Java，其余仍走当前站点的 PHP。
 */
(function () {
  'use strict'

  /** PHP 相对路径 -> Spring 路径（不含 host） */
  var REWRITE = {
    'api/company/verify_api.php': '/api/company/verify'
  }

  function phpBasePath() {
    var pathname = window.location.pathname || '/'
    return pathname.replace(/[^/]*$/, '') || '/'
  }

  window.resolveApiPath = function (pathAndQuery) {
    if (!pathAndQuery || typeof pathAndQuery !== 'string') {
      return pathAndQuery
    }
    var qIndex = pathAndQuery.indexOf('?')
    var path = qIndex >= 0 ? pathAndQuery.slice(0, qIndex) : pathAndQuery
    var qs = qIndex >= 0 ? pathAndQuery.slice(qIndex) : ''
    var springBase =
      typeof window.__API_BASE_URL__ === 'string' && window.__API_BASE_URL__.trim() !== ''
        ? window.__API_BASE_URL__.replace(/\/$/, '')
        : ''
    if (springBase && Object.prototype.hasOwnProperty.call(REWRITE, path)) {
      return springBase + REWRITE[path] + qs
    }
    return new URL(pathAndQuery, window.location.origin + phpBasePath()).href
  }
})()
