'use strict';
'require view';
'require form';
'require ui';
'require uci';
'require poll';
'require rpc';

// ==================== RPC BACKEND ====================
var callTSLoad = rpc.declare({
	object: 'torrserver',
	method: 'load',
	expect: {}
});

var callTSStatus = rpc.declare({
	object: 'torrserver',
	method: 'status',
	expect: {}
});

var callTSService = rpc.declare({
	object: 'torrserver',
	method: 'service',
	params: ['action'],
	expect: {}
});

var callTSProcessRaw = rpc.declare({
	object: 'torrserver',
	method: 'process_raw',
	expect: {}
});

var callTSVersionBin = rpc.declare({
	object: 'torrserver',
	method: 'version_bin',
	expect: {}
});

var callTSDisk = rpc.declare({
	object: 'torrserver',
	method: 'disk',
	expect: {}
});

var callTSFileList = rpc.declare({
	object: 'torrserver',
	method: 'file_list',
	expect: {}
});

var callTSFileRead = rpc.declare({
	object: 'torrserver',
	method: 'file_read',
	params: ['name'],
	expect: {}
});

var callTSFileWrite = rpc.declare({
	object: 'torrserver',
	method: 'file_write',
	params: ['name', 'content'],
	expect: {}
});

var callTSLogRead = rpc.declare({
	object: 'torrserver',
	method: 'log_read',
	params: ['name', 'offset', 'limit'],
	expect: {}
});

var callTSUserInfo = rpc.declare({
	object: 'torrserver',
	method: 'user_info',
	params: ['user'],
	expect: {}
});

var callTSFixPermissions = rpc.declare({
    object: 'torrserver',
    method: 'fix_permissions',
    expect: {}
});

var callTSListMounts = rpc.declare({
    object: 'torrserver',
    method: 'list_mounts',
    expect: {}
});

var callTSBackupSave = rpc.declare({
    object: 'torrserver',
    method: 'backup_save',
    params: ['target_dir'],
    expect: {}
});

var callTSBackupRestore = rpc.declare({
    object: 'torrserver',
    method: 'backup_restore',
    params: ['archive_path'],
    expect: {}
});

var callTSActiveStreams = rpc.declare({
object: 'torrserver',
method: 'active_streams',
expect: {}
});
var callTSCheckTools = rpc.declare({
object: 'torrserver',
method: 'check_tools',
expect: {}
});

var _statusFetching = false;
var _diskFetching = false;
var _pollsActive = true;
var toolsAvailable = { ffprobe: true, fuse: true, ca_bundle: true };

// ==================== API HELPERS ====================
function getApiBase() {
	var host = window.location.hostname;
	var port = uci.get('torrserver', 'global', 'port') || '8090';
	var ssl = uci.get('torrserver', 'global', 'ssl') || '0';
	var sslport = uci.get('torrserver', 'global', 'sslport') || '8091';
	var protocol = (ssl === '1') ? 'https' : 'http';
	var activePort = (ssl === '1') ? sslport : port;
	return protocol + '://' + host + ':' + activePort;
}

function apiGet(endpoint, params) {
    var url = getApiBase() + endpoint;
    if (params) {
        var query = Object.keys(params).map(function(k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');
        url += '?' + query;
    }
    return fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors'
    }).then(function(response) {
        if (!response.ok) {
            // Читаем текст ошибки, чтобы показать реальную причину от сервера
            return response.text().then(function(text) {
                throw new Error('HTTP ' + response.status + ': ' + text);
            });
        }
        return response.text();
    }).then(function(text) {
        try { return JSON.parse(text); } catch(e) { return text; }
    }).catch(function(err) {
        throw new Error('API GET failed: ' + err.message);
    });
}

function apiGetText(endpoint) {
	var url = getApiBase() + endpoint;
	return fetch(url, {
		method: 'GET',
		mode: 'cors'
	}).then(function(response) {
		if (!response.ok) throw new Error('HTTP ' + response.status);
		return response.text();
	}).catch(function(err) {
		throw new Error('API GET failed: ' + err.message);
	});
}

function apiPost(endpoint, data) {
	var url = getApiBase() + endpoint;
	return fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		},
		mode: 'cors',
		body: JSON.stringify(data)
	}).then(function(response) {
		if (!response.ok) throw new Error('HTTP ' + response.status);
		return response.text();
	}).then(function(text) {
		try { return JSON.parse(text); } catch(e) { return text; }
	}).catch(function(err) {
		throw new Error('API POST failed: ' + err.message);
	});
}

function apiUpload(endpoint, formData) {
	var url = getApiBase() + endpoint;
	return fetch(url, {
		method: 'POST',
		mode: 'cors',
		body: formData
	}).then(function(response) {
		if (!response.ok) throw new Error('HTTP ' + response.status);
		return response.json();
	}).catch(function(err) {
		throw new Error('API Upload failed: ' + err.message);
	});
}

function esc(s) {
	return String(s == null ? '' : s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function tsIsNearBottom(el, threshold) {
    if (!el) return true;
    threshold = threshold || 40;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

function tsSelectNode(node) {
    if (!node) return;

    try {
        var range = document.createRange();
        range.selectNodeContents(node);

        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    } catch (e) {}
}

function tsCopyNode(node) {
    if (!node) return;

    var text = node.textContent || '';

    var done = function() {
        ui.addNotification(null, E('p', _('Log copied to clipboard.')));
    };

    var fallback = function() {
        try {
            tsSelectNode(node);
            var ok = document.execCommand('copy');

            if (ok) {
                done();
            } else {
                ui.addNotification(null, E('p', _('Copy failed. Please select text manually.')));
            }
        } catch (e) {
            ui.addNotification(null, E('p', _('Copy failed. Please select text manually.')));
        }
    };

    if (window.navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
        fallback();
    }
}

function tsEnableCtrlA(container, target) {
    if (!container || !target) return;

    var handler = function(ev) {
        if (!document.body.contains(container)) {
            document.removeEventListener('keydown', handler);
            return;
        }

        var key = (ev.key || '').toLowerCase();

        if ((ev.ctrlKey || ev.metaKey) && (key === 'a' || ev.keyCode === 65)) {
            var tagName = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';

            if (tagName === 'input' || tagName === 'textarea') {
                return;
            }

            ev.preventDefault();
            tsSelectNode(target);
        }
    };

    document.addEventListener('keydown', handler);
}

function tsCopyButton(node) {
    return E('button', {
        'class': 'btn',
        'click': function() {
            tsCopyNode(node);
        }
    }, _('Copy whole log to clipboard'));
}

function openStartupErrorsLog(content) {
    var logContainer = E('pre', {
        'class': 'ts-log-pre',
        style: 'max-height:500px; overflow:auto; background:#1e1e1e; color:#d4d4d4; padding:15px; font-family:monospace; white-space:pre; font-size:.85em; border:1px solid #444;'
    }, content || _('Log is empty.'));

    var closeButton = E('button', {
        'class': 'btn',
        'click': ui.hideModal
    }, _('Close'));

    var toolbar = E('div', { 'class': 'ts-log-toolbar' }, [
        tsCopyButton(logContainer),
        closeButton
    ]);

    var logWrap = E('div', { 'class': 'ts-log-wrap' }, [logContainer]);

    var modalBody = E('div', { 'class': 'ts-log-modal' }, [
        toolbar,
        logWrap
    ]);

    tsEnableCtrlA(modalBody, logContainer);

    ui.showModal(_('Possible startup errors'), [modalBody]);

    setTimeout(function() {
        logContainer.scrollTop = logContainer.scrollHeight;
    }, 0);
}

function fmtMem(kb) {
    if (!kb || isNaN(kb) || kb <= 0) return _('N/A');
    if (kb >= 1024) return Math.round(kb / 1024) + ' ' + _('MB');
    return Math.round(kb) + ' ' + _('KB');
}

function fmtSize(bytes) {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return _('N/A');
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' ' + _('GB');
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' ' + _('MB');
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' ' + _('KB');
    return bytes + ' ' + _('B');
}

function fmtSpeed(bytesPerSec) {
    if (bytesPerSec === null || bytesPerSec === undefined || isNaN(bytesPerSec) || bytesPerSec < 0) return '—';
    if (bytesPerSec === 0) return '0 ' + _('B/s');
    if (bytesPerSec >= 1048576) return (bytesPerSec / 1048576).toFixed(2) + ' ' + _('MB/s');
    if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(2) + ' ' + _('KB/s');
    return Math.round(bytesPerSec) + ' ' + _('B/s');
}

function fmtUptime(seconds) {
	if (!seconds || isNaN(seconds) || seconds < 0) return _('N/A');
	var d = Math.floor(seconds / 86400);
	var h = Math.floor((seconds % 86400) / 3600);
	var m = Math.floor((seconds % 3600) / 60);
	var s = seconds % 60;
	var parts = [];
	if (d > 0) parts.push(d + _('d'));
	if (h > 0 || d > 0) parts.push(h + _('h'));
	if (m > 0 || h > 0 || d > 0) parts.push(m + _('m'));
	parts.push(s + _('s'));
	return parts.join(' ');
}

function fmtDate(timestamp) {
	if (!timestamp) return _('N/A');
	return new Date(timestamp * 1000).toLocaleString();
}

function nonNegInt(section_id, value) {
	if (value === '') return true;
	if (!/^\d+$/.test(value)) return _('Must be a whole number (0 or more)');
	return true;
}

function validateProxyUrl(section_id, value) {
	if (value === '') return true;
	if (!/^(https?|socks[45]h?):\/\/.+/.test(value))
		return _('Must be http://, https://, socks4://, socks5:// or socks5h:// URL');
	return true;
}

function validateTorrentAddr(section_id, value) {
	if (value === '') return true;
	if (!/^(\[?[0-9a-fA-F.:]+\]?)?:\d{1,5}$/.test(value))
		return _('Format: [IP]:PORT, e.g. :32000 or 127.0.0.1:32768');
	return true;
}

function validateTgToken(section_id, value) {
	if (value === '') return true;
	if (!/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(value))
		return _('Invalid token format. Expected: 123456789:ABCdefGHI…');
	return true;
}

function validateSslPath(section_id, value) {
	if (value === '') return true;
	if (!/^\/.*\.(pem|crt|cer|key|der|p12|pfx)$/.test(value))
		return _('Absolute path with .pem, .crt, .cer, .key, .der, .p12 or .pfx extension required');
	return true;
}

function validateAbsPath(section_id, value) {
	if (value === '') return true;
	if (value.charAt(0) !== '/')
		return _('Must be an absolute path (starting with /)');
	return true;
}

function validateIpRule(section_id, value) {
	if (value === '') return true;
	var lines = value.split('\n');
	for (var i = 0; i < lines.length; i++) {
		var line = lines[i].trim();
		if (line === '' || line.charAt(0) === '#') continue;
		var colonIdx = line.lastIndexOf(':');
		var ipPart = colonIdx >= 0 ? line.substring(colonIdx + 1) : line;
		ipPart = ipPart.trim();
		if (!ipPart) continue;
		var hyphenIdx = ipPart.indexOf('-');
		if (hyphenIdx >= 0) {
			var ip1 = ipPart.substring(0, hyphenIdx).trim();
			var ip2 = ipPart.substring(hyphenIdx + 1).trim();
			if (!validateSingleIP(ip1) || !validateSingleIP(ip2))
				return _('Line ') + (i + 1) + _(': invalid IP range format. Use: IP-IP or just IP');
		} else {
			if (!validateSingleIP(ipPart))
				return _('Line ') + (i + 1) + _(': invalid IP address format');
		}
	}
	return true;
}

function validateSingleIP(ip) {
	var parts = ip.split('.');
	if (parts.length !== 4) return false;
	for (var i = 0; i < 4; i++) {
		var n = parseInt(parts[i], 10);
		if (isNaN(n) || n < 0 || n > 255) return false;
		if (parts[i] !== String(n)) return false;
	}
	return true;
}

function parseToMB(sizeStr) {
	if (!sizeStr) return _('N/A');
	var num = parseFloat(sizeStr);
	if (isNaN(num)) return _('N/A');
	if (sizeStr.indexOf('G') !== -1 || sizeStr.indexOf('g') !== -1) {
		return Math.round(num * 1024);
	} else if (sizeStr.indexOf('M') !== -1 || sizeStr.indexOf('m') !== -1) {
		return Math.round(num);
	} else if (sizeStr.indexOf('K') !== -1 || sizeStr.indexOf('k') !== -1) {
		return Math.round(num / 1024);
	} else if (sizeStr.indexOf('T') !== -1 || sizeStr.indexOf('t') !== -1) {
		return Math.round(num * 1024 * 1024);
	}
	return Math.round(num);
}

function getStatusText(stat) {
	if (stat === null || stat === undefined) return _('Unknown');
	var statusMap = {
		0: _('Added'),
		1: _('Getting Info'),
		2: _('Preload'),
		3: _('Working'),
		4: _('Closed'),
		5: _('In DB')
	};
	return statusMap[stat] || _('Unknown');
}

function formatTorrentStats(stats) {
	if (!stats || stats.total === 0) {
		return '0 ' + _('total');
	}
	var parts = [stats.total + ' ' + _('total')];
	if (stats.working > 0) parts.push(stats.working + ' ' + _('working'));
	if (stats.active  > 0) parts.push(stats.active  + ' ' + _('preloading'));
	if (stats.paused  > 0) parts.push(stats.paused  + ' ' + _('paused'));
	if (stats.inDb    > 0) parts.push(stats.inDb    + ' ' + _('in DB (idle)'));
	return parts.join(', ');
}

// ==================== SEARCH API FUNCTIONS ====================
function searchRutor(query) {
	return apiGet('/search', { query: query });
};

function searchTorznab(query) {
	return apiGet('/torznab/search', { query: query });
};

function openSearchDialog() {
	var container = E('div');
	container.appendChild(E('p', {}, _('Search torrents from Rutor and Torznab sources:')));

	var queryInput = E('input', {
		type: 'text',
		class: 'cbi-input-text',
		placeholder: _('Enter search query…'),
		style: 'width:100%; margin-bottom:10px;'
	});

	var sourceSelect = E('select', {
		class: 'cbi-input-select',
		style: 'width:100%; margin-bottom:15px;'
	}, [
		E('option', { value: 'rutor' }, 'Rutor'),
		E('option', { value: 'torznab' }, 'Torznab')
	]);

	var resultsDiv = E('div', { id: 'search-results', style: 'max-height:400px; overflow-y:auto;' });

	container.appendChild(queryInput);
	container.appendChild(sourceSelect);
	container.appendChild(E('div', { style: 'margin-bottom:15px;' }, [
		E('button', {
			class: 'cbi-button cbi-button-action',
			click: function() {
				var query = queryInput.value.trim();
				if (!query) {
					ui.addNotification(null, E('p', _('Please enter a search query')));
					return;
				}
				var source = sourceSelect.value;
				var searchFn = source === 'rutor' ? searchRutor : searchTorznab;

				resultsDiv.innerHTML = '';
				resultsDiv.appendChild(E('p', {}, _('Searching…')));

				searchFn(query).then(function(results) {
					if (!results || results.length === 0) {
						resultsDiv.innerHTML = '';
						resultsDiv.appendChild(E('p', {}, _('No results found.')));
						return;
					}

					var table = E('table', { class: 'table' }, [
						E('tr', { class: 'tr table-titles' }, [
							E('th', { class: 'th', style: 'text-align:left; width:40%;' }, _('Title')),
							E('th', { class: 'th', style: 'text-align:center; width:15%;' }, _('Size')),
							E('th', { class: 'th', style: 'text-align:center; width:15%;' }, _('Seeds')),
							E('th', { class: 'th', style: 'text-align:center; width:15%;' }, _('Peers')),
							E('th', { class: 'th', style: 'text-align:center; width:15%;' }, _('Actions'))
						])
					]);

					results.forEach(function(r) {
						table.appendChild(E('tr', { class: 'tr' }, [
							E('td', { class: 'td', style: 'text-align:left; font-size:.9em;' }, esc(r.title || r.name)),
							E('td', { class: 'td', style: 'text-align:center;' }, esc(r.size || _('N/A'))),
							E('td', { class: 'td', style: 'text-align:center;' }, String(r.seed || 0)),
							E('td', { class: 'td', style: 'text-align:center;' }, String(r.peer || 0)),
							E('td', { class: 'td', style: 'text-align:center;' }, [
								E('button', {
									class: 'cbi-button cbi-button-action',
									click: function() {
										addTorrentByLink(r.link || r.magnet, r.title)
											.then(function() {
												ui.addNotification(null, E('p', _('Torrent added successfully!')));
											})
											.catch(function(err) {
												ui.addNotification(null, E('p', _('Failed to add torrent:') + ' ' + esc(err.message)));
											});
									}
								}, _('Add'))
							])
						]));
					});

					resultsDiv.innerHTML = '';
					resultsDiv.appendChild(table);
				}).catch(function(err) {
					resultsDiv.innerHTML = '';
					resultsDiv.appendChild(E('div', { class: 'alert-message error' },
						_('Search failed:') + ' ' + esc(err.message || err)));
				});
			}
		}, _('Search'))
	]));

	container.appendChild(resultsDiv);
	container.appendChild(E('div', { class: 'right' }, [
		E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
	]));

	ui.showModal(_('Search Torrents'), [container]);
};

// ==================== STORAGE SETTINGS ====================
function getStorageSettings() {
	return apiGet('/storage/settings');
};

function updateStorageSettings(settingsType, viewedType) {
	var url = getApiBase() + '/storage/settings';
	var body = new URLSearchParams();
	if (settingsType) body.append('settings', settingsType);
	if (viewedType) body.append('viewed', viewedType);

	return fetch(url, {
		method: 'POST',
		mode: 'cors',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString()
	}).then(function(response) {
		if (!response.ok) throw new Error('HTTP ' + response.status);
		return response.json();
	}).catch(function(err) {
		throw new Error('API Upload failed: ' + err.message);
	});
};

function openStorageSettings() {
	getStorageSettings().then(function(settings) {
		var container = E('div');
		container.appendChild(E('div', { class: 'alert-message info' }, [
			E('p', { style: 'margin:0 0 8px 0;' }, [
				_('TorrServer allows you to choose between different storage types for settings and viewing history. These settings are configured in the TorrServer web interface under'),
				' ',
				E('strong', {}, _('Settings → PRO Mode → Storage')),
				'.'
			]),
			E('p', { style: 'margin:0 0 8px 0;' }, [
				E('strong', {}, _('Settings Storage:') + ' '),
				_('JSON file (settings.json) or BBolt database (config.db).') + ' ' + _('JSON is easier to edit/backup, BBolt is more reliable.')
			]),
			E('p', { style: 'margin:0;' }, [
				E('strong', {}, _('Viewing History Storage:') + ' '),
				_('BBolt database (config.db) or JSON file (viewed.json).')
			])
		]));

		var currentSettings = settings.settings || 'bbolt';
		var currentViewed = settings.viewed || 'bbolt';

		console.log('Storage settings from API:', settings);
		console.log('Current settings:', currentSettings, 'Current viewed:', currentViewed);

		var settingsSelect = E('select', {
			class: 'cbi-input-select',
			style: 'width:100%;'
		}, [
			E('option', { value: 'json' }, _('JSON (easier to edit)')),
			E('option', { value: 'bbolt' }, _('BBolt (more reliable)'))
		]);

		var viewedSelect = E('select', {
			class: 'cbi-input-select',
			style: 'width:100%;'
		}, [
			E('option', { value: 'json' }, _('JSON')),
			E('option', { value: 'bbolt' }, _('BBolt'))
		]);

		settingsSelect.value = currentSettings;
		viewedSelect.value = currentViewed;

		console.log('settingsSelect.value after set:', settingsSelect.value);
		console.log('viewedSelect.value after set:', viewedSelect.value);

		var formSection = E('div', { class: 'cbi-section', style: 'margin-top:15px;' }, [

			E('div', { class: 'cbi-value', style: 'margin-bottom:15px;' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto; font-weight:bold;' }, _('Settings Storage Type')),
				E('div', { class: 'cbi-value-field' }, settingsSelect)
			]),


			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto; font-weight:bold;' }, _('Viewed History Storage Type')),
				E('div', { class: 'cbi-value-field' }, viewedSelect)
			])
		]);

		container.appendChild(formSection);

		container.appendChild(E('div', { class: 'alert-message warning', style: 'margin-top:15px;' }, [
			E('strong', {}, _('Warning:')), ' ',
			_('Changing storage type requires TorrServer restart. Existing data in the old storage format will not be automatically migrated.')
		]));

		container.appendChild(E('div', { class: 'right' }, [
			E('button', {
				class: 'cbi-button cbi-button-action',
				click: function() {
					updateStorageSettings(settingsSelect.value, viewedSelect.value)
						.then(function() {
							ui.addNotification(null, E('p', _('Storage settings updated! Please restart TorrServer to apply changes.')));
							ui.hideModal();
						})
						.catch(function(err) {
							ui.addNotification(null, E('p', _('Failed to update storage settings:') + ' ' + esc(err.message)));
						});
				}
			}, _('Save')),
			E('button', { class: 'btn', click: ui.hideModal }, _('Cancel'))
		]));

		ui.showModal(_('Storage Settings'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to load storage settings:') + ' ' + esc(err.message)));
	});
};

// ==================== TMDB SETTINGS ====================
function getTMDBSettings() {
	return apiGet('/tmdb/settings');
};

function openTMDBSettings() {
	getTMDBSettings().then(function(settings) {
		var container = E('div');

		container.appendChild(E('div', { class: 'alert-message info' },
			_('TMDB is used to fetch movie posters and metadata. Get your API key at themoviedb.org')));

		var settingsList = E('div', { class: 'cbi-section' }, [
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title' }, _('API Key:')),
				E('div', { class: 'cbi-value-field' },
					settings.apikey ? E('code', {}, '••••••••' + settings.apikey.slice(-4)) : E('em', {}, _('Not set'))
				)
			]),
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title' }, _('API URL:')),
				E('div', { class: 'cbi-value-field' }, E('code', {}, esc(settings.apiurl || 'https://api.themoviedb.org')))
			]),
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title' }, _('Image URL:')),
				E('div', { class: 'cbi-value-field' }, E('code', {}, esc(settings.imageURL || 'https://image.tmdb.org')))
			]),
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title' }, _('Image URL (RU):')),
				E('div', { class: 'cbi-value-field' }, E('code', {}, esc(settings.imageURLRu || 'https://imagetmdb.com')))
			])
		]);

		container.appendChild(settingsList);
		container.appendChild(E('div', { class: 'right' }, [
			E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
		]));

		ui.showModal(_('TMDB Settings'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to load TMDB settings:') + ' ' + esc(err.message)));
	});
};

// ==================== GSTREAMER SETTINGS ====================
function getGStreamerSettings() {
	return apiGet('/gst/settings');
};

function openGStreamerSettings() {
	getGStreamerSettings().then(function(settings) {
		var container = E('div');

		if (!settings.built_in) {
			container.appendChild(E('div', { class: 'alert-message error' },
				_('GStreamer is not built into this TorrServer build. This feature is only available in -gst builds.')));
		} else {
			container.appendChild(E('div', { class: 'alert-message success' },
				_('GStreamer is available and built-in.')));

			// Предупреждение о производительности
			container.appendChild(E('div', { class: 'alert-message warning' }, [
				E('strong', {}, _('Performance Warning:')),
				' ',
				_('GStreamer enables real-time video transcoding, allowing playback of incompatible formats (MKV, HEVC, etc.) in browsers and DLNA players. However, transcoding is extremely CPU-intensive. Most routers have weak processors (single/dual-core ARM at 800MHz-1.5GHz) and limited RAM (128-512MB), which are insufficient for smooth HD/4K transcoding. Expect stuttering, buffering, or crashes when transcoding high-resolution video. For best performance, use direct playback (no transcoding) or external media players (VLC, Kodi) via M3U playlists.')
			]));

			container.appendChild(E('h4', { style: 'margin-top:15px; margin-bottom:10px;' }, _('Current Configuration')));

			var configList = E('pre', {
				style: 'max-height:300px; overflow-y:auto;'
			}, JSON.stringify(settings.config || {}, null, 2));
			container.appendChild(configList);

			container.appendChild(E('details', { style: 'margin-top:15px; margin-bottom:15px;' }, [
				E('summary', { style: 'cursor:pointer; font-weight:bold; padding:8px;' }, _('Show Defaults')),
				E('pre', {
					style: 'max-height:300px; overflow-y:auto; margin-top:10px;'
				}, JSON.stringify(settings.defaults || {}, null, 2))
			]));
		}

		container.appendChild(E('div', { class: 'right' }, [
			E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
		]));

		ui.showModal(_('GStreamer Settings'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to load GStreamer settings:') + ' ' + esc(err.message)));
	});
};

// ==================== SPEED TEST ====================
function runSpeedTest() {
	var container = E('div');

	container.appendChild(E('div', { class: 'alert-message info' },
		_('This test measures the speed of your local network between the router and your current device. It does NOT measure your internet speed or torrent download speed from external sources.')
	));

	container.appendChild(E('p', {}, _('Download a test file to measure your connection speed:')));

	var sizeInput = E('input', {
		type: 'number',
		class: 'cbi-input-text',
		value: 10,
		min: 1,
		max: 1000,
		style: 'width:80px;'
	});

	var startBtn = E('button', {
		class: 'cbi-button cbi-button-action'
	}, _('Start Test'));

	var resultsDiv = E('div', { id: 'speed-results', style: 'margin-top:15px;' });

	container.appendChild(sizeInput);
	container.appendChild(E('span', {}, ' ' + _('MB')));
	container.appendChild(E('div', { style: 'margin-top:10px;' }, startBtn));
	container.appendChild(resultsDiv);

	startBtn.addEventListener('click', function() {
		var size = parseInt(sizeInput.value, 10);
		if (!size || size < 1 || size > 1000) {
			ui.addNotification(null, E('p', _('Please enter a valid size (1-1000 MB)')));
			return;
		}

		 	startBtn.disabled = true;
 	startBtn.textContent = _('Testing…');
 	resultsDiv.innerHTML = '';

 	var progressDiv = E('div', { style: 'margin-top:15px;' }, [
 		E('div', { class: 'cbi-progressbar' }, E('div', { style: 'width:0%' })),
 		E('div', { id: 'speed-info', style: 'margin-top:10px; font-size:.9em;' })
 	]);
 	var progressBar = progressDiv.querySelector('.cbi-progressbar > div');
 	resultsDiv.appendChild(progressDiv);

 	var url = getApiBase() + '/download/' + size;
 	var startTime = Date.now();
 	var totalBytes = size * 1024 * 1024;

 	fetch(url, {
 		method: 'GET',
 		mode: 'cors'
 	}).then(function(response) {
 		if (!response.ok) throw new Error('HTTP ' + response.status);
 		var reader = response.body.getReader();
 		var receivedBytes = 0;

 		function read() {
 			reader.read().then(function(result) {
 				if (result.done) {
 					progressBar.style.width = '100%';
 					var speedInfo = document.getElementById('speed-info');
 					var duration = (Date.now() - startTime) / 1000;
 					var speed = (receivedBytes / duration) / (1024 * 1024);
 					if (speedInfo) {
 						speedInfo.innerHTML = '';
 						speedInfo.appendChild(E('div', {}, [
 							E('strong', {}, _('Test completed!')),
 							E('br'),
 							_('Downloaded:') + ' ' + fmtSize(receivedBytes),
 							E('br'),
 							_('Duration:') + ' ' + duration.toFixed(2) + 's',
 							E('br'),
 							_('Average speed:') + ' ' + speed.toFixed(2) + ' ' + _('MB/s') + ' (' + (speed * 8).toFixed(2) + ' ' + _('Mbps') + ')',
 							E('br'),
 							E('em', {}, _('This is your local network speed between router and this device.'))
 						]));
 					}
 					startBtn.disabled = false;
 					startBtn.textContent = _('Start Test');
 					return;
 				}
 				receivedBytes += result.value.length;
 				var pct = Math.min(100, (receivedBytes / totalBytes) * 100);
 				progressBar.style.width = pct.toFixed(1) + '%';
 				var speedInfo = document.getElementById('speed-info');
 				if (speedInfo) {
 					var elapsed = (Date.now() - startTime) / 1000;
 					var currentSpeed = (receivedBytes / elapsed) / (1024 * 1024);
 					speedInfo.textContent = _('Downloading…') + ' ' + fmtSize(receivedBytes) + ' / ' + fmtSize(totalBytes) +
 				    ' (' + pct.toFixed(0) + '%) | ' + _('Current speed:') + ' ' + currentSpeed.toFixed(2) + ' ' + _('MB/s');
 				}
 				read();
 			});
 		}
 		read();
 	}).catch(function(err) {
 		resultsDiv.innerHTML = '';
 		resultsDiv.appendChild(E('div', { class: 'alert-message error' },
 			_('Speed test failed:') + ' ' + esc(err.message || err)));
 		startBtn.disabled = false;
 		startBtn.textContent = _('Start Test');
 	});
	});

	container.appendChild(E('div', { class: 'right' }, [
		E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
	]));

	ui.showModal(_('Speed Test'), [container]);
};

// ==================== FILE PROBE ====================
function viewFileProbe(hash, fileIndex) {
	apiGet('/ffp/' + hash + '/' + fileIndex).then(function(info) {
		var container = E('div');

		var infoPre = E('pre', {
			style: 'max-height:400px; overflow-y:auto;'
		}, JSON.stringify(info, null, 2));
		container.appendChild(infoPre);
		container.appendChild(E('div', { class: 'right' }, [
			E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
		]));
		ui.showModal(_('File Probe Info'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to get file info:') + ' ' + esc(err.message)));
	});
};

// ==================== IN-BROWSER VIDEO PLAYER ====================
function playInBrowser(hash, fileId, title, filename) {
	var url = getStreamUrl(hash, fileId, filename, { play: true });
	var container = E('div');

	container.appendChild(E('h4', { style: 'margin-bottom:10px;' }, esc(title || filename || _('Video Player'))));

	container.appendChild(E('div', { class: 'alert-message warning' },
		_('Browser support depends on container and codecs. MP4 (H.264+AAC) works in all browsers. WebM works in Chrome, Firefox, Edge. MKV plays only in Chrome/Edge with supported codecs (H.264+AAC, VP8/VP9). AVI, WMV, FLV are not supported by any browser — use VLC or Kodi via M3U playlist, or open the stream link in a media player.')));

	var videoEl = E('video', {
		controls: true,
		autoplay: true,
		style: 'width:100%; max-height:70vh;'
	});
	videoEl.appendChild(E('source', { src: url }));
	container.appendChild(videoEl);

	container.appendChild(E('div', { class: 'cbi-section-descr', style: 'margin-top:10px; text-align:center;' }, [
		_('If video does not play, try the') + ' ',
		E('a', { href: url, target: '_blank' }, _('direct video stream link'))
	]));

	container.appendChild(E('div', { class: 'right' }, [
		E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
	]));

	ui.showModal(_('Play in Browser'), [container]);
};

// ==================== SERVER STATISTICS ====================
function viewServerStatistics() {
	apiGetText('/stat').then(function(stats) {
		var container = E('div');
		var statsPre = E('pre', {
			style: 'max-height:400px; overflow-y:auto; white-space:pre-wrap;'
		}, stats);
		container.appendChild(statsPre);
		container.appendChild(E('div', { class: 'right' }, [
			E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
		]));
		ui.showModal(_('TorrServer Statistics'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to get statistics:') + ' ' + esc(err.message)));
	});
};

// ==================== TORRENT MANAGEMENT FUNCTIONS ====================
function addTorrentByLink(link, title, category, poster, data, saveToDb) {
	if (!link) return Promise.reject(new Error('Link is required'));
	var req = {
		action: 'add',
		link: link,
		save_to_db: saveToDb !== false
	};
	if (title) req.title = title;
	if (category) req.category = category;
	if (poster) req.poster = poster;
	if (data) req.data = data;
	return apiPost('/torrents', req);
};

function getTorrentInfo(hash) {
	if (!hash) return Promise.reject(new Error('Hash is required'));
	return apiPost('/torrents', { action: 'get', hash: hash });
};

function setTorrentInfo(hash, title, category, poster, data) {
	if (!hash) return Promise.reject(new Error('Hash is required'));
	var req = { action: 'set', hash: hash };
	if (title !== undefined) req.title = title;
	if (category !== undefined) req.category = category;
	if (poster !== undefined) req.poster = poster;
	if (data !== undefined) req.data = data;
	return apiPost('/torrents', req);
};

function removeTorrent(hash) {
	if (!hash) return Promise.reject(new Error('Hash is required'));
	return apiPost('/torrents', { action: 'rem', hash: hash });
};

function listTorrents() {
	return apiPost('/torrents', { action: 'list' });
};

function dropTorrent(hash) {
	if (!hash) return Promise.reject(new Error('Hash is required'));
	return apiPost('/torrents', { action: 'drop', hash: hash });
};

function wipeAllTorrents() {
	return apiPost('/torrents', { action: 'wipe' });
};

function uploadTorrentFiles(files, title, category, poster, data, save) {
	if (!files || files.length === 0) return Promise.reject(new Error('No files provided'));
	var formData = new FormData();
	for (var i = 0; i < files.length; i++) {
		formData.append('file', files[i]);
	}
	if (save) formData.append('save', 'true');
	if (title && files.length === 1) formData.append('title', title);
	if (category) formData.append('category', category);
	if (poster && files.length === 1) formData.append('poster', poster);
	if (data) formData.append('data', data);
	return apiUpload('/torrent/upload', formData);
};

function getCacheStats(hash) {
	if (!hash) return Promise.reject(new Error('Hash is required'));
	return apiPost('/cache', { action: 'get', hash: hash });
};

function dropCache(hash) {
	if (!hash) return Promise.reject(new Error('Hash is required'));
        return apiPost('/torrents', { action: 'drop', hash: hash });
};

function getSettings() {
	return apiPost('/settings', { action: 'get' });
};

function setSettings(settingsObj) {
    var req = {
        action: 'set',
        sets: settingsObj
    };
    return apiPost('/settings', req);
};

function resetSettingsToDefaults() {
	return apiPost('/settings', { action: 'def' });
};

function setViewed(hash, fileIndex) {
	if (!hash) return Promise.reject(new Error('Hash is required'));
	return apiPost('/viewed', { action: 'set', hash: hash, file_index: fileIndex });
};

function removeViewed(hash, fileIndex) {
	if (!hash) return Promise.reject(new Error('Hash is required'));
	return apiPost('/viewed', { action: 'rem', hash: hash, file_index: fileIndex });
};

function listViewed(hash) {
	var req = { action: 'list' };
	if (hash) req.hash = hash;
	return apiPost('/viewed', req);
};

function getPlayUrl(hash, fileIndex) {
	return getApiBase() + '/play/' + encodeURIComponent(hash) + '/' + encodeURIComponent(fileIndex);
};

function getStreamUrl(hash, fileId, filename, opts) {
	opts = opts || {};
	var safeName = (filename || 'stream').replace(/[/\\?%*:|"<>]/g, '_');
	safeName = encodeURIComponent(safeName);
	var params = ['link=' + encodeURIComponent(hash), 'index=' + encodeURIComponent(fileId)];
	if (opts.play) params.push('play');
	if (opts.preload) params.push('preload');
	if (opts.save) params.push('save');
	if (opts.m3u) params.push('m3u');
	if (opts.fromlast) params.push('fromlast');
	return getApiBase() + '/stream/' + safeName + '?' + params.join('&');
};

function getPlaylistUrl(hash, fromlast) {
	var url = getApiBase() + '/playlist';
	var params = [];
	if (hash) params.push('hash=' + encodeURIComponent(hash));
	if (fromlast) params.push('fromlast');
	if (params.length > 0) url += '?' + params.join('&');
	return url;
};

function getAllPlaylistUrl() {
	return getApiBase() + '/playlistall/all.m3u';
};

function getServerVersion() {
	return apiGet('/echo');
};

function shutdownServer() {
	return apiGet('/shutdown');
};

// ==================== UI COMPONENTS ====================
function openTorrentManager() {
	var container = E('div');
	var listDiv = E('div', { id: 'torrent-list', style: 'max-height:450px; overflow-y:auto; margin-bottom:15px;' });

	container.appendChild(E('div', { class: 'cbi-page-actions', style: 'margin-bottom:15px;' }, [
		E('button', {
			class: 'cbi-button cbi-button-action',
			click: function() { openAddTorrentDialog(); }
		}, _('Add by Link')),
		E('button', {
			class: 'cbi-button cbi-button-action',
			click: function() { openUploadTorrentDialog(); }
		}, _('Upload .torrent')),
		E('button', {
			class: 'cbi-button cbi-button-neutral',
			click: function() { openSearchDialog(); }
		}, _('Search')),
		E('button', {
			class: 'cbi-button cbi-button-reset',
			click: function() { confirmWipeAll(); }
		}, _('Wipe All'))
	]));

	container.appendChild(listDiv);
	container.appendChild(E('div', { class: 'right' }, [
		E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
	]));

	ui.showModal(_('Torrent Manager'), [container]);
	refreshTorrentList();
};

// ==================== IP LIST EDITOR (WHITELIST / BLACKLIST) ====================
function openIpListEditor(name, title, warningText, defaultContent, isWhitelist) {
	function parseIpLine(line) {
		var trimmed = line.trim();
		if (trimmed === '') return { type: 'empty' };
		if (trimmed.charAt(0) === '#') {
			return { type: 'comment', text: trimmed.substring(1).trim() };
		}
		var colonIdx = trimmed.lastIndexOf(':');
		var description = '';
		var ipPart = trimmed;
		if (colonIdx >= 0) {
			var afterColon = trimmed.substring(colonIdx + 1).trim();
			if (/^\d/.test(afterColon)) {
				description = trimmed.substring(0, colonIdx).trim();
				ipPart = afterColon;
			}
		}
		var hyphenIdx = ipPart.indexOf('-');
		if (hyphenIdx >= 0) {
			return {
				type: 'rule',
				description: description,
				ip: ipPart.substring(0, hyphenIdx).trim(),
				ipEnd: ipPart.substring(hyphenIdx + 1).trim()
			};
		}
		return { type: 'rule', description: description, ip: ipPart.trim(), ipEnd: '' };
	}

	return callTSFileRead(name).then(function(res) {
		if (!res || !res.ok) {
			ui.addNotification(null, E('p', _('Failed to read file: ') + (res && res.error ? res.error : 'unknown error')));
			return;
		}

		var content = res.exists ? res.content : (defaultContent || '');
		var lines = content.split('\n');
		var entries = [];

		lines.forEach(function(line) {
			var parsed = parseIpLine(line);
			if (parsed.type !== 'empty') entries.push(parsed);
		});

		if (entries.length === 0) {
			entries.push({ type: 'rule', description: '', ip: '', ipEnd: '' });
		}

		var container = E('div');

		if (warningText) {
			container.appendChild(E('div', { class: 'alert-message warning' }, warningText));
		}

		container.appendChild(E('p', { class: 'cbi-section-descr' }, [
			isWhitelist
				? _('Whitelist has priority! If non-empty, only listed IPs can access TorrServer.')
				: _('Blacklisted IPs are blocked from accessing TorrServer.'),
			' ',
			E('strong', {}, _('Restart TorrServer to apply changes.'))
		]));

		var entriesContainer = E('div');

		function renderEntries() {
			entriesContainer.innerHTML = '';
			entries.forEach(function(entry, idx) {
				var rowDiv;
				if (entry.type === 'comment') {
					rowDiv = E('div', {
						style: 'display:flex; gap:5px; margin-bottom:8px; align-items:center; padding:8px; border-left:3px solid #ffc107;'
					}, [
						E('span', { style: 'min-width:24px; flex-shrink:0;' }, '💬'),
						E('input', {
							type: 'text',
							class: 'cbi-input-text',
							placeholder: _('Comment text'),
							value: entry.text || '',
							style: 'flex:1;',
							input: function(ev) { entries[idx].text = ev.target.value; }
						}),
						E('button', {
							class: 'cbi-button cbi-button-reset',
							click: function() {
								entries.splice(idx, 1);
								if (entries.length === 0) entries.push({ type: 'rule', description: '', ip: '', ipEnd: '' });
								renderEntries();
							}
						}, '✕')
					]);
				} else {
					rowDiv = E('div', {
						style: 'display:flex; gap:5px; margin-bottom:8px; align-items:center; padding:8px; flex-wrap:wrap; border-left:3px solid #0069d6;'
					}, [
						E('span', { style: 'font-weight:bold; min-width:24px; flex-shrink:0;' }, (idx + 1) + '.'),
						E('input', {
							type: 'text',
							class: 'cbi-input-text',
							placeholder: _('Description'),
							value: entry.description || '',
							style: 'width:120px;',
							input: function(ev) { entries[idx].description = ev.target.value; }
						}),
						E('span', {}, ':'),
						E('input', {
							type: 'text',
							class: 'cbi-input-text',
							placeholder: _('IP address'),
							value: entry.ip || '',
							style: 'width:140px; font-family:monospace;',
							input: function(ev) { entries[idx].ip = ev.target.value; }
						}),
						E('span', {}, '—'),
						E('input', {
							type: 'text',
							class: 'cbi-input-text',
							placeholder: _('End IP (range)'),
							value: entry.ipEnd || '',
							style: 'width:140px; font-family:monospace;',
							input: function(ev) { entries[idx].ipEnd = ev.target.value; }
						}),
						E('button', {
							class: 'cbi-button cbi-button-reset',
							click: function() {
								entries.splice(idx, 1);
								if (entries.length === 0) entries.push({ type: 'rule', description: '', ip: '', ipEnd: '' });
								renderEntries();
							}
						}, '✕')
					]);
				}
				entriesContainer.appendChild(rowDiv);
			});
		}
		renderEntries();

		container.appendChild(entriesContainer);

		container.appendChild(E('div', { class: 'cbi-page-actions', style: 'margin-top:10px;' }, [
			E('button', {
				class: 'cbi-button cbi-button-action',
				click: function() {
					entries.push({ type: 'rule', description: '', ip: '', ipEnd: '' });
					renderEntries();
				}
			}, '+ ' + _('Add Rule')),
			E('button', {
				class: 'cbi-button cbi-button-neutral',
				click: function() {
					entries.push({ type: 'comment', text: '' });
					renderEntries();
				}
			}, '+ ' + _('Add Comment'))
		]));

		container.appendChild(E('p', { class: 'cbi-value-description', style: 'margin-top:10px;' }, [
			_('Format:') + ' ',
			E('code', {}, '[description:]IP[-IP] or just IP'),
			'. ' + _('Leave "End IP" empty for a single IP address. Yellow rows are comments.')
		]));

		container.appendChild(E('div', { class: 'cbi-page-actions right' }, [
			E('button', {
				class: 'cbi-button cbi-button-action',
				click: function() {
					var errors = [];
					var resultLines = [];

					for (var i = 0; i < entries.length; i++) {
						var entry = entries[i];
						if (entry.type === 'comment') {
							resultLines.push('# ' + (entry.text || ''));
							continue;
						}
						var ip = (entry.ip || '').trim();
						var ipEnd = (entry.ipEnd || '').trim();
						var desc = (entry.description || '').trim();

						if (!ip) continue;

						if (!validateSingleIP(ip)) {
							errors.push(_('Row %d: invalid IP address "%s".').format(i + 1, ip));
							continue;
						}
						if (ipEnd && !validateSingleIP(ipEnd)) {
							errors.push(_('Row %d: invalid end IP address "%s".').format(i + 1, ipEnd));
							continue;
						}

						var line = '';
						if (desc) line += desc + ':';
						line += ip;
						if (ipEnd) line += '-' + ipEnd;
						resultLines.push(line);
					}

					if (errors.length > 0) {
						ui.addNotification(null, E('div', { class: 'alert-message error' }, [
							E('p', { style: 'font-weight:bold; margin-bottom:5px;' }, _('Validation errors:')),
							E('ul', { style: 'margin:0; padding-left:20px;' }, errors.map(function(e) { return E('li', {}, e); }))
						]));
						return;
					}

					var newContent = resultLines.length > 0 ? resultLines.join('\n') + '\n' : '';

					callTSFileWrite(name, newContent).then(function(wres) {
						if (!wres || !wres.ok) {
							ui.addNotification(null, E('p', _('Failed to save: ') + (wres && wres.error ? wres.error : 'unknown error')));
							return;
						}
						ui.addNotification(null, E('p', _('File saved successfully!') + ' ' + _('Restart TorrServer to apply changes.')));
						ui.hideModal();
					}).catch(function(err) {
						ui.addNotification(null, E('p', _('Save error: ') + esc(err.message)));
					});
				}
			}, _('Save')),
			E('button', { class: 'btn', click: ui.hideModal }, _('Cancel'))
		]));

		ui.showModal(title, [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to load file: ') + esc(err.message)));
	});
};

// ==================== HTTP AUTH CREDENTIALS EDITOR ====================
function openAccsConfigEditor() {
	return callTSFileRead('accs').then(function(res) {
		if (!res || !res.ok) {
			ui.addNotification(null, E('p', _('Failed to read accs.db: ') + (res && res.error ? res.error : 'unknown error')));
			return;
		}

		var accounts = {};
		if (res.exists && res.content) {
			try {
				accounts = JSON.parse(res.content);
				if (typeof accounts !== 'object' || accounts === null || Array.isArray(accounts)) {
					accounts = {};
				}
			} catch (e) {
				ui.addNotification(null, E('p', _('Failed to parse accs.db: ') + e.message));
				accounts = {};
			}
		}

		var container = E('div');
		container.appendChild(E('p', { class: 'cbi-section-descr' }, [
			_('Manage HTTP authentication credentials. Each row is a user account.'),
			' ',
			E('strong', {}, _('Restart TorrServer to apply changes.'))
		]));

		container.appendChild(E('div', { class: 'alert-message warning' }, [
			E('strong', {}, _('Security Warning:')), ' ',
			_('Credentials are stored in plain text JSON format. Anyone with file access can read your passwords. File permissions are set to 600 automatically.')
		]));

		var rows = [];
		Object.keys(accounts).forEach(function(login) {
			rows.push({ login: login, password: accounts[login] });
		});
		if (rows.length === 0) {
			rows.push({ login: '', password: '' });
		}

		var rowsContainer = E('div', { id: 'accs-rows-container' });

		function renderRows() {
			rowsContainer.innerHTML = '';
			rows.forEach(function(row, idx) {
				var rowDiv = E('div', {
					style: 'display:flex; gap:8px; margin-bottom:8px; align-items:center; padding:10px; border-left:3px solid #0069d6; flex-wrap:wrap;'
				}, [
					E('span', { style: 'font-weight:bold; width:24px; flex-shrink:0;' }, (idx + 1) + '.'),
					E('input', {
						type: 'text',
						class: 'cbi-input-text',
						placeholder: _('Username'),
						value: row.login,
						style: 'flex:2;',
						input: function(ev) { rows[idx].login = ev.target.value; }
					}),
					E('input', {
						type: 'text',
						class: 'cbi-input-text',
						placeholder: _('Password'),
						value: row.password,
						style: 'flex:2; font-family:monospace;',
						input: function(ev) { rows[idx].password = ev.target.value; }
					}),
					E('button', {
						class: 'cbi-button cbi-button-reset',
						click: function() {
							rows.splice(idx, 1);
							if (rows.length === 0) rows.push({ login: '', password: '' });
							renderRows();
						}
					}, '✕')
				]);
				rowsContainer.appendChild(rowDiv);
			});
		}
		renderRows();

		var formSection = E('div', { class: 'cbi-section' }, [
			E('h4', {}, _('User Accounts')),
			rowsContainer,
			E('div', { class: 'cbi-page-actions', style: 'margin-top:10px;' }, [
				E('button', {
					class: 'cbi-button cbi-button-action',
					click: function() {
						rows.push({ login: '', password: '' });
						renderRows();
					}
				}, '+ ' + _('Add User'))
			])
		]);

		container.appendChild(formSection);

		container.appendChild(E('div', { class: 'cbi-page-actions right' }, [
			E('button', {
				class: 'cbi-button cbi-button-action',
				click: function() {
					var newAccounts = {};
					var errors = [];
					var loginSet = {};

					for (var i = 0; i < rows.length; i++) {
						var login = rows[i].login.trim();
						var password = rows[i].password;

						if (!login && !password) continue;

						if (!login) {
							errors.push(_('Row %d: username is empty.').format(i + 1));
							continue;
						}
						if (!password) {
							errors.push(_('Row %d: password for user "%s" is empty.').format(i + 1, login));
							continue;
						}
						if (loginSet[login]) {
							errors.push(_('Row %d: duplicate username "%s".').format(i + 1, login));
							continue;
						}
						loginSet[login] = true;
						newAccounts[login] = password;
					}

					if (errors.length > 0) {
						ui.addNotification(null, E('div', { class: 'alert-message error' }, [
							E('p', { style: 'font-weight:bold; margin-bottom:5px;' }, _('Validation errors:')),
							E('ul', { style: 'margin:0; padding-left:20px;' }, errors.map(function(e) { return E('li', {}, e); }))
						]));
						return;
					}

					if (Object.keys(newAccounts).length === 0) {
						if (!confirm(_('You are about to remove all credentials. HTTP authentication will still be enabled, but with no valid users. Continue?'))) {
							return;
						}
					}

					var newContent = JSON.stringify(newAccounts, null, 2);

					callTSFileWrite('accs', newContent).then(function(wres) {
						if (!wres || !wres.ok) {
							ui.addNotification(null, E('p', _('Failed to save accs.db: ') + (wres && wres.error ? wres.error : 'unknown error')));
							return;
						}
						ui.addNotification(null, E('p', _('Authentication credentials saved successfully!') + ' ' + _('Restart TorrServer to apply changes.')));
						ui.hideModal();
					}).catch(function(err) {
						ui.addNotification(null, E('p', _('Save error: ') + esc(err.message)));
					});
				}
			}, _('Save')),
			E('button', { class: 'btn', click: ui.hideModal }, _('Cancel'))
		]));

		ui.showModal(_('HTTP Authentication Credentials'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to load accs.db: ') + esc(err.message)));
	});
};

// ==================== TELEGRAM BOT CONFIGURATION ====================
function openTgConfigEditor() {
	var path = (uci.get('torrserver', 'global', 'path') || '/var/etc/torrserver').replace(/\/+$/, '');
	var configPath = path + '/tg.cfg';

	return callTSFileRead('tg').then(function(res) {
		if (!res || !res.ok) {
			ui.addNotification(null, E('p', _('Failed to read tg.cfg: ') + (res && res.error ? res.error : 'unknown error')));
			return;
		}

		var config = {};
		if (res.exists && res.content) {
			try {
				config = JSON.parse(res.content);
			} catch (e) {
				ui.addNotification(null, E('p', _('Failed to parse tg.cfg: ') + e.message));
				config = {};
			}
		}

		var container = E('div');
		container.appendChild(E('p', { class: 'cbi-section-descr' }, [
			_('Configure Telegram bot settings. Changes are saved to tg.cfg in the TorrServer working directory.'),
			' ',
			E('strong', {}, _('Restart TorrServer to apply changes.'))
		]));

		container.appendChild(E('div', { class: 'alert-message info' }, [
			E('h4', {}, _('About Telegram Bot')),
			E('p', {}, _('The Telegram bot allows you to:')),
			E('ul', {}, [
				E('li', {}, _('Search and add torrents via Telegram')),
				E('li', {}, _('Get notifications about download progress')),
				E('li', {}, _('Control playback from your phone'))
			]),
			E('p', {}, [
				E('strong', {}, _('To enable:')), ' ',
				_('Set the Telegram bot token in the "Telegram Bot" section on this page.')
			])
		]));

		// HostTG
		var elHostTG = E('input', {
			type: 'text',
			class: 'cbi-input-text',
			value: config.HostTG || 'https://api.telegram.org',
			style: 'width:100%;',
			placeholder: 'https://api.telegram.org'
		});

		// HostWeb
		var elHostWeb = E('input', {
			type: 'text',
			class: 'cbi-input-text',
			value: config.HostWeb || '',
			style: 'width:100%;',
			placeholder: 'http://192.168.1.100:8090 (auto-detected if empty)'
		});

		// Socks5
		var elSocks5 = E('input', {
			type: 'text',
			class: 'cbi-input-text',
			value: config.Socks5 || '',
			style: 'width:100%;',
			placeholder: _('127.0.0.1:1080 or socks5://user:pass@host:port')
		});

		// Dynamic lists for IDs
		var whiteIds = (config.WhiteIds && Array.isArray(config.WhiteIds))
			? config.WhiteIds.map(function(id) { return String(id); })
			: [''];
		var blackIds = (config.BlackIds && Array.isArray(config.BlackIds))
			? config.BlackIds.map(function(id) { return String(id); })
			: [''];

		// Container for dynamic ID lists
		var whiteContainer = E('div', { style: 'margin-top:5px;' });
		var blackContainer = E('div', { style: 'margin-top:5px;' });

		function renderIdList(container, ids, placeholderText) {
			container.innerHTML = '';
			ids.forEach(function(id, idx) {
				var rowDiv = E('div', {
					style: 'display:flex; gap:5px; margin-bottom:5px; align-items:center;'
				}, [
					E('span', {
						style: 'font-weight:bold; min-width:24px; flex-shrink:0; text-align:right;'
					}, (idx + 1) + '.'),
					E('input', {
						type: 'text',
						class: 'cbi-input-text',
						placeholder: placeholderText,
						value: id,
						style: 'flex:1; font-family:monospace;',
						input: function(ev) { ids[idx] = ev.target.value; }
					}),
					E('button', {
						class: 'cbi-button cbi-button-reset',
						click: function() {
							ids.splice(idx, 1);
							if (ids.length === 0) ids.push('');
							renderIdList(container, ids, placeholderText);
						}
					}, '✕')
				]);
				container.appendChild(rowDiv);
			});
		}
		renderIdList(whiteContainer, whiteIds, '123456789');
		renderIdList(blackContainer, blackIds, '123456789');

		// Use "column" layout for full-width fields (label above, input below)
		function addFullRow(label, element, description) {
			var row = E('div', { style: 'margin-bottom:12px; display:block;' }, [
				E('label', { style: 'display:block; font-weight:bold; margin-bottom:4px; text-align:left;' }, label),
				E('div', { style: 'display:block;' }, [ element ]),
				description ? E('div', { class: 'cbi-value-description', style: 'margin-top:3px;' }, description) : null
			]);
			return row;
		}

		var formSection = E('div', { class: 'cbi-section' }, [
			addFullRow(
				_('Telegram API URL'),
				elHostTG,
				_('Base URL for Telegram Bot API. Default: https://api.telegram.org')
			),
			addFullRow(
				_('Web Interface URL'),
				elHostWeb,
				_('Base URL for stream links sent to Telegram. Leave empty for auto-detection.')
			),
			addFullRow(
				_('SOCKS5 Proxy'),
				elSocks5,
				_('Optional SOCKS5 proxy for connecting to Telegram API. Format: host:port or socks5://user:pass@host:port')
			),

			// WhiteIds - dynamic list
			E('div', { style: 'margin-bottom:12px; display:block;' }, [
				E('label', { style: 'display:block; font-weight:bold; margin-bottom:4px; text-align:left;' },
					_('Allowed User IDs (WhiteIds)')),
				whiteContainer,
				E('button', {
					class: 'cbi-button cbi-button-action',
					style: 'margin-top:5px;',
					click: function() {
						whiteIds.push('');
						renderIdList(whiteContainer, whiteIds, '123456789');
					}
				}, '+ ' + _('Add ID')),
				E('div', { class: 'cbi-value-description', style: 'margin-top:3px;' },
					_('Telegram user IDs allowed to use the bot. Get user ID from @userinfobot or @getmyid_bot. Empty list = allow all users.'))
			]),

			// BlackIds - dynamic list
			E('div', { style: 'margin-bottom:12px; display:block;' }, [
				E('label', { style: 'display:block; font-weight:bold; margin-bottom:4px; text-align:left;' },
					_('Blocked User IDs (BlackIds)')),
				blackContainer,
				E('button', {
					class: 'cbi-button cbi-button-action',
					style: 'margin-top:5px;',
					click: function() {
						blackIds.push('');
						renderIdList(blackContainer, blackIds, '123456789');
					}
				}, '+ ' + _('Add ID')),
				E('div', { class: 'cbi-value-description', style: 'margin-top:3px;' },
					_('Telegram user IDs blocked from using the bot. Blacklisted users cannot interact with the bot.'))
			])
		]);

		container.appendChild(formSection);

		container.appendChild(E('div', { class: 'cbi-page-actions right' }, [
			E('button', {
				class: 'cbi-button cbi-button-action',
				click: function() {
					var hostTG = elHostTG.value.trim();
					var hostWeb = elHostWeb.value.trim();
					var socks5 = elSocks5.value.trim();

					// Parse WhiteIds
					var parsedWhite = [];
					for (var i = 0; i < whiteIds.length; i++) {
						var line = whiteIds[i].trim();
						if (line === '' || line.charAt(0) === '#') continue;
						var id = parseInt(line, 10);
						if (isNaN(id)) {
							ui.addNotification(null, E('p', _('Invalid WhiteIds format at position %d: %s').format(i + 1, line)));
							return;
						}
						parsedWhite.push(id);
					}

					// Parse BlackIds
					var parsedBlack = [];
					for (var j = 0; j < blackIds.length; j++) {
						var bline = blackIds[j].trim();
						if (bline === '' || bline.charAt(0) === '#') continue;
						var bid = parseInt(bline, 10);
						if (isNaN(bid)) {
							ui.addNotification(null, E('p', _('Invalid BlackIds format at position %d: %s').format(j + 1, bline)));
							return;
						}
						parsedBlack.push(bid);
					}

					var newConfig = {
						HostTG: hostTG || 'https://api.telegram.org',
						HostWeb: hostWeb,
						Socks5: socks5,
						WhiteIds: parsedWhite,
						BlackIds: parsedBlack
					};

					var newContent = JSON.stringify(newConfig, null, 2);

					callTSFileWrite('tg', newContent).then(function(wres) {
						if (!wres || !wres.ok) {
							ui.addNotification(null, E('p', _('Failed to save tg.cfg: ') + (wres && wres.error ? wres.error : 'unknown error')));
							return;
						}
						ui.addNotification(null, E('p', _('Telegram bot configuration saved successfully!') + ' ' + _('Restart TorrServer to apply changes.')));
						ui.hideModal();
					}).catch(function(err) {
						ui.addNotification(null, E('p', _('Save error: ') + esc(err.message)));
					});
				}
			}, _('Save')),
			E('button', { class: 'btn', click: ui.hideModal }, _('Cancel'))
		]));

		ui.showModal(_('Telegram Bot Configuration'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to load tg.cfg: ') + esc(err.message)));
	});
};

// ==================== VIDEO WATCHER ====================
function openVideoWatcher() {
	var container = E('div');
	container.appendChild(E('p', {},
		_('Select a torrent and file to watch. Only torrents with active status (Working/Preload) can be streamed.')));

	container.appendChild(E('div', { class: 'alert-message info', style: 'display:flex; align-items:center; justify-content:space-between;' }, [
		E('span', {}, _('Download M3U playlist with all torrents for external players (VLC, Kodi, etc.)')),
		E('button', {
			class: 'cbi-button cbi-button-neutral',
			click: function() { downloadM3UPlaylist(); }
		}, _('M3U All Torrents'))
	]));

	var torrentSelectDiv = E('div', { style: 'margin-bottom:15px;' });
	torrentSelectDiv.appendChild(E('label', {}, _('Select torrent:')));
	var torrentSelect = E('select', {
		id: 'vw-torrent-select',
		class: 'cbi-input-select',
		style: 'width:100%;'
	}, [E('option', { value: '' }, _('Loading torrents…'))]);
	torrentSelectDiv.appendChild(torrentSelect);

	var fileSelectDiv = E('div', { id: 'vw-file-section', style: 'display:none; margin-bottom:15px;' });
	fileSelectDiv.appendChild(E('label', {}, _('Select file:')));
	var fileSelect = E('select', {
		id: 'vw-file-select',
		class: 'cbi-input-select',
		style: 'width:100%;'
	});
	fileSelectDiv.appendChild(fileSelect);

	var preloadRow = E('div', { style: 'margin-top:10px; display:flex; align-items:center; gap:10px;' });
	var preloadBtn = E('button', {
		class: 'cbi-button cbi-button-action',
		id: 'vw-preload-btn',
		click: function() { vwPreloadTorrent(); }
	}, _('Preload'));
	preloadRow.appendChild(preloadBtn);
	preloadRow.appendChild(E('span', { class: 'cbi-value-description' },
		_('Activate torrent and download initial data if files are not yet available')));
	fileSelectDiv.appendChild(preloadRow);

	var actionsDiv = E('div', { id: 'vw-actions', style: 'display:none; margin-top:10px;' });
	var buttonsRow = E('div', { class: 'cbi-page-actions' });
	buttonsRow.appendChild(E('button', {
		class: 'cbi-button cbi-button-neutral',
		click: function() { vwPlaySelected(); }
	}, _('Watch in Browser')));
	buttonsRow.appendChild(E('button', {
		class: 'cbi-button cbi-button-neutral',
		click: function() { vwDownloadSelected(); }
	}, _('Download Full Video')));
	buttonsRow.appendChild(E('button', {
		class: 'cbi-button cbi-button-neutral',
		click: function() { vwM3USelected(); }
	}, _('M3U')));
var probeBtnProps = {
class: 'cbi-button cbi-button-neutral',
click: function() { vwProbeSelected(); }
};
if (!toolsAvailable.ffprobe) {
probeBtnProps.disabled = true;
probeBtnProps.title = _('Requires ffprobe package. Install via: opkg install ffprobe');
buttonsRow.appendChild(E('button', probeBtnProps, _('Probe (N/A)')));
} else {
buttonsRow.appendChild(E('button', probeBtnProps, _('Probe')));
}
	buttonsRow.appendChild(E('button', {
		class: 'cbi-button cbi-button-neutral',
		click: function() { vwMarkViewed(); }
	}, _('Mark Viewed')));
	actionsDiv.appendChild(buttonsRow);

	var previewDiv = E('div', { id: 'vw-preview', style: 'margin-top:15px;' });

	container.appendChild(torrentSelectDiv);
	container.appendChild(fileSelectDiv);
	container.appendChild(actionsDiv);
	container.appendChild(previewDiv);
	container.appendChild(E('div', { class: 'right' }, [
		E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
	]));

	listTorrents().then(function(torrents) {
		torrentSelect.innerHTML = '';
		if (!torrents || torrents.length === 0) {
			torrentSelect.appendChild(E('option', { value: '' }, _('No torrents available')));
			return;
		}
		torrentSelect.appendChild(E('option', { value: '' }, _('— Choose torrent —')));
		torrents.forEach(function(t) {
			var status = getStatusText(t.stat);
			var label = (t.title || t.name || t.hash) + ' [' + status + ']';
			var opt = E('option', { value: t.hash }, label);
			torrentSelect.appendChild(opt);
		});
	}).catch(function(err) {
		torrentSelect.innerHTML = '';
		torrentSelect.appendChild(E('option', { value: '' }, _('Failed to load torrents')));
	});

	torrentSelect.addEventListener('change', function() {
		var hash = this.value;
		if (!hash) {
			fileSelectDiv.style.display = 'none';
			actionsDiv.style.display = 'none';
			previewDiv.innerHTML = '';
			return;
		}
		fileSelectDiv.style.display = '';
		actionsDiv.style.display = 'none';
		previewDiv.innerHTML = '';
		previewDiv.appendChild(E('p', {}, _('Loading files…')));
		getTorrentInfo(hash).then(function(info) {
			var files = extractFilesFromData(info);
			fileSelect.innerHTML = '';
			if (files.length === 0) {
				fileSelect.appendChild(E('option', { value: '' }, _('No files found')));
				previewDiv.innerHTML = '';
				return;
			}
			fileSelect.appendChild(E('option', { value: '' }, _('— Choose file —')));
			files.forEach(function(f, idx) {
				var filePath = f.path || f.Path || ('File ' + idx);
				var fileSize = f.length || f.Length || 0;
				var fileId = f.id !== undefined ? f.id : (f.Id !== undefined ? f.Id : idx);
				fileSelect.appendChild(E('option', {
					value: fileId,
					'data-path': filePath,
					'data-size': fileSize
				}, filePath + ' (' + fmtSize(fileSize) + ')'));
			});
			previewDiv.innerHTML = '';
		}).catch(function(err) {
			previewDiv.innerHTML = '';
			previewDiv.appendChild(E('div', { class: 'alert-message error' },
				_('Failed to load files:') + ' ' + esc(err.message)));
		});
	});

	fileSelect.addEventListener('change', function() {
		actionsDiv.style.display = this.value === '' ? 'none' : '';
	});

	ui.showModal(_('Watch Video from Torrents'), [container]);
};

function vwGetSelection() {
    var torrentSelect = document.getElementById('vw-torrent-select');
    var fileSelect = document.getElementById('vw-file-select');
    if (!torrentSelect || !fileSelect) return null;
    var hash = torrentSelect.value;
    var fileId = fileSelect.value;
    if (!hash || fileId === '') return null;
    var opt = fileSelect.options[fileSelect.selectedIndex];
    var filePath = opt ? opt.getAttribute('data-path') : 'video';
    var torrentTitle = torrentSelect.options[torrentSelect.selectedIndex] ?
        torrentSelect.options[torrentSelect.selectedIndex].textContent.split(' [')[0] : '';
    return { hash: hash, fileId: parseInt(fileId, 10), filePath: filePath, title: torrentTitle };
};

function vwPlaySelected() {
    var sel = vwGetSelection();
    if (!sel) { ui.addNotification(null, E('p', _('Please select a torrent and file first.'))); return; }
    playInBrowser(sel.hash, sel.fileId, sel.title, sel.filePath);
};

function vwDownloadSelected() {
    var sel = vwGetSelection();
    if (!sel) { ui.addNotification(null, E('p', _('Please select a torrent and file first.'))); return; }
    downloadFile(sel.hash, sel.fileId, sel.filePath);
};

function vwM3USelected() {
    var sel = vwGetSelection();
    if (!sel) { ui.addNotification(null, E('p', _('Please select a torrent and file first.'))); return; }
    downloadTorrentM3U(sel.hash);
};

function vwProbeSelected() {
    var sel = vwGetSelection();
    if (!sel) { ui.addNotification(null, E('p', _('Please select a torrent and file first.'))); return; }
    viewFileProbe(sel.hash, sel.fileId);
};

function vwMarkViewed() {
    var sel = vwGetSelection();
    if (!sel) { ui.addNotification(null, E('p', _('Please select a torrent and file first.'))); return; }
    setViewed(sel.hash, sel.fileId)
        .then(function() {
            ui.addNotification(null, E('p', _('File marked as viewed!')));
        })
        .catch(function(err) {
            ui.addNotification(null, E('p', _('Failed to mark as viewed:') + ' ' + esc(err.message || err)));
        });
};

function vwPreloadTorrent() {
    var torrentSelect = document.getElementById('vw-torrent-select');
    var fileSelect = document.getElementById('vw-file-select');
    var previewDiv = document.getElementById('vw-preview');
    var preloadBtn = document.getElementById('vw-preload-btn');

    if (!torrentSelect || !torrentSelect.value) {
        ui.addNotification(null, E('p', _('Please select a torrent first.')));
        return;
    }

    var hash = torrentSelect.value;

    if (preloadBtn) preloadBtn.disabled = true;

    if (previewDiv) {
        previewDiv.innerHTML = '';
        previewDiv.appendChild(E('div', { style: 'text-align:center; padding:20px;' }, [
            E('div', { class: 'spinner' }),
            E('p', { id: 'vw-preload-status', class: 'cbi-value-description', style: 'margin-top:5px;' },
                '🔄 ' + _('Waiting for torrent to activate and files to appear…'))
        ]));
    }

    var url = getApiBase() + '/stream?link=' + encodeURIComponent(hash) + '&preload';

    fetch(url, { method: 'GET', mode: 'cors' }).then(function(response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);

        var attempts = 0;
        var maxAttempts = 15;
        var pollTimer = setInterval(function() {
            attempts++;
                     var statusEl = document.getElementById('vw-preload-status');
                     if (statusEl) {
                     statusEl.textContent = '🔄 ' + _('Checking for files… (attempt %d of %d)').format(attempts, maxAttempts);
            }

            getTorrentInfo(hash).then(function(info) {
                var files = extractFilesFromData(info);
                if (files.length > 0) {
                    clearInterval(pollTimer);
                    if (preloadBtn) preloadBtn.disabled = false;

                    fileSelect.innerHTML = '';
                    fileSelect.appendChild(E('option', { value: '' }, _('— Choose file —')));
                    files.forEach(function(f, idx) {
                        var filePath = f.path || f.Path || ('File ' + idx);
                        var fileSize = f.length || f.Length || 0;
                        var fileId = f.id !== undefined ? f.id : (f.Id !== undefined ? f.Id : idx);
                        fileSelect.appendChild(E('option', {
                            value: fileId,
                            'data-path': filePath,
                            'data-size': fileSize
                        }, filePath + ' (' + fmtSize(fileSize) + ')'));
                    });

                    if (previewDiv) {
                        previewDiv.innerHTML = '';
                        previewDiv.appendChild(E('div', { class: 'alert-message success' },
	_('Files found!') + ' ' + files.length + ' ' + _('file(s) available. Select a file to watch.')));
                    }

                    ui.addNotification(null, E('p', _('Preload complete! %d file(s) found.').format(files.length)));
                } else if (attempts >= maxAttempts) {
                    // Таймаут — файлы не появились
                    clearInterval(pollTimer);
                    if (preloadBtn) preloadBtn.disabled = false;
                    if (previewDiv) {
                        previewDiv.innerHTML = '';
                        previewDiv.appendChild(E('div', { class: 'alert-message warning' },
                        	_('Files did not appear within %d seconds. The torrent may need more time, or it has no files. Try closing and reopening this dialog.').format(maxAttempts * 2)));
                    }
                }
            }).catch(function() {
                // Ошибка запроса — продолжаем polling
                if (attempts >= maxAttempts) {
                    clearInterval(pollTimer);
                    if (preloadBtn) preloadBtn.disabled = false;
                    if (previewDiv) {
                        previewDiv.innerHTML = '';
                        previewDiv.appendChild(E('div', { class: 'alert-message error' },
                        	_('Failed to get torrent info after multiple attempts.')));
                    }
                }
            });
        }, 2000);

    }).catch(function(err) {
        if (preloadBtn) preloadBtn.disabled = false;
        if (previewDiv) {
            previewDiv.innerHTML = '';
            previewDiv.appendChild(E('div', { class: 'alert-message error' },
            	_('Failed to start preload:') + ' ' + esc(err.message)));
        }
    });
};

function refreshTorrentList() {
	var listDiv = document.getElementById('torrent-list');
	if (!listDiv) return;

	listDiv.innerHTML = '';
	listDiv.appendChild(E('p', {}, _('Loading…')));

	listTorrents().then(function(torrents) {
		if (!torrents || torrents.length === 0) {
			listDiv.innerHTML = '';
			listDiv.appendChild(E('p', {}, _('No torrents added yet.')));
			return;
		}

		var table = E('table', { class: 'table' }, [
			E('tr', { class: 'tr table-titles' }, [
                                E('th', { class: 'th', style: 'text-align:left; width:28%;' }, _('Title') + ' / ' + _('Torrent Hash')),
				E('th', { class: 'th', style: 'text-align:center; width:10%;' }, _('Category')),
				E('th', { class: 'th', style: 'text-align:center; width:8%;' }, _('Status')),
				E('th', { class: 'th', style: 'text-align:right; width:10%;' }, _('Size')),
				E('th', { class: 'th', style: 'text-align:center; width:6%;' }, _('Files')),
				E('th', { class: 'th', style: 'text-align:center; width:38%;' }, _('Actions'))
			])
		]);

		torrents.forEach(function(t) {
			var status = getStatusText(t.stat);
			var fileCount = t.file_stats ? t.file_stats.length : 0;
			table.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td', style: 'text-align:left;' }, [
                                    E('div', { style: 'font-weight:bold; margin-bottom:3px;' }, esc(t.title || t.name || t.hash)),
                                    E('div', {}, E('code', { style: 'word-break:break-all;' }, esc(t.hash)))
                                ]),
				E('td', { class: 'td', style: 'text-align:center;' }, esc(t.category || '—')),
				E('td', { class: 'td', style: 'text-align:center;' },
					E('span', { style: 'font-weight:bold;' }, status)
				),
				E('td', { class: 'td', style: 'text-align:right;' }, fmtSize(t.torrent_size)),
				E('td', { class: 'td', style: 'text-align:center;' }, String(fileCount)),
				E('td', { class: 'td', style: 'text-align:center;' }, [
					E('button', {
						class: 'cbi-button cbi-button-action',
						click: function() { viewTorrentDetails(t); }
					}, _('View')),
					E('button', {
						class: 'cbi-button cbi-button-neutral',
						click: function() { editTorrentInfo(t); }
					}, _('Edit')),
					E('button', {
						class: 'cbi-button cbi-button-reset',
						click: function() { confirmRemoveTorrent(t.hash); }
					}, _('Remove'))
				])
			]));
		});

		listDiv.innerHTML = '';
		listDiv.appendChild(table);
	}).catch(function(err) {
		listDiv.innerHTML = '';
		listDiv.appendChild(E('div', { class: 'alert-message error' },
			_('Failed to load torrents:') + ' ' + esc(err.message || err)));
	});
};

function openAddTorrentDialog() {
    var container = E('div');
    container.appendChild(E('p', {}, _('Add torrent by magnet link, hash, URL, or torrs:// link:')));

    var linkInput = E('input', {
        type: 'text',
        class: 'cbi-input-text',
        placeholder: 'magnet:?xt=urn:btih:… | http://… | torrs://…',
        style: 'width:100%; margin-bottom:10px; font-family:monospace;'
    });

    var titleInput = E('input', {
        type: 'text',
        class: 'cbi-input-text',
        placeholder: _('Optional title'),
        style: 'width:100%; margin-bottom:10px;'
    });

    var categoryInput = E('input', {
        type: 'text',
        class: 'cbi-input-text',
        placeholder: _('Optional category'),
        style: 'width:100%; margin-bottom:10px;'
    });

    var posterInput = E('input', {
        type: 'text',
        class: 'cbi-input-text',
        placeholder: _('Optional poster URL'),
        style: 'width:100%; margin-bottom:10px;'
    });

    var dataInput = E('textarea', {
        class: 'cbi-input-textarea',
        placeholder: _('Optional custom data (JSON)'),
        rows: 3,
        style: 'width:100%; margin-bottom:10px; font-family:monospace;'
    });

    var saveCheckbox = E('input', { type: 'checkbox', checked: true, style: 'margin-right:6px;' });
    var saveLabel = E('label', { style: 'cursor:pointer;' }, [
        saveCheckbox,
        E('span', {}, _('Save to database'))
    ]);

    var saveHint = E('div', { class: 'cbi-value-description', style: 'margin-top:5px; margin-left:24px;' },
        _('If enabled, the torrent is saved in the database and will remain in the list after TorrServer restarts (shown as "In DB" when inactive). If disabled, the torrent exists only in memory and will be permanently lost after TorrServer restarts.'));

    container.appendChild(linkInput);
    container.appendChild(titleInput);
    container.appendChild(categoryInput);
    container.appendChild(posterInput);
    container.appendChild(dataInput);
    container.appendChild(E('div', { style: 'margin-bottom:10px;' }, [saveLabel, saveHint]));

    container.appendChild(E('div', { class: 'right' }, [
        E('button', {
            class: 'cbi-button cbi-button-action',
            click: function() {
                var link = linkInput.value.trim();
                var title = titleInput.value.trim();
                var category = categoryInput.value.trim();
                var poster = posterInput.value.trim();
                var data = dataInput.value.trim();
                var saveToDb = saveCheckbox.checked;

                if (!link) {
                    ui.addNotification(null, E('p', _('Please enter a link')));
                    return;
                }

                addTorrentByLink(link, title, category, poster, data, saveToDb)
                    .then(function(result) {
                        ui.addNotification(null, E('p', _('Torrent added successfully!')));
                        ui.hideModal();
                        setTimeout(function() { refreshTorrentList(); }, 500);
                    })
                    .catch(function(err) {
                        ui.addNotification(null, E('p', _('Failed to add torrent:') + ' ' + esc(err.message || err)));
                    });
            }
        }, _('Add')),
        E('button', { class: 'btn', click: ui.hideModal }, _('Cancel'))
    ]));

    ui.showModal(_('Add Torrent'), [container]);
};

function openUploadTorrentDialog() {
	var container = E('div');
	container.appendChild(E('p', {}, _('Upload one or more .torrent files:')));
	var fileInput = E('input', {
		type: 'file',
		accept: '.torrent',
		multiple: true,
		style: 'width:100%; padding:8px; margin-bottom:10px;'
	});
	var titleInput = E('input', {
		type: 'text',
		placeholder: _('Title (single file only)'),
		style: 'width:100%; padding:8px; margin-bottom:10px;'
	});
	var categoryInput = E('input', {
		type: 'text',
		placeholder: _('Optional category'),
		style: 'width:100%; padding:8px; margin-bottom:10px;'
	});
	var posterInput = E('input', {
		type: 'text',
		placeholder: _('Poster URL (single file only)'),
		style: 'width:100%; padding:8px; margin-bottom:10px;'
	});
	var dataInput = E('textarea', {
		placeholder: _('Optional custom data (JSON)'),
		rows: 3,
		style: 'width:100%; padding:8px; margin-bottom:10px; font-family:monospace; font-size:.9em;'
	});
	var saveCheckbox = E('input', { type: 'checkbox', checked: true, style: 'vertical-align:middle; margin-right:6px;' });
        var saveLabel = E('label', { style: 'cursor:pointer; display:inline-flex; align-items:center;' }, [
            saveCheckbox,
            E('span', {}, _('Save to database'))
        ]);
        var saveHint = E('div', { class: 'cbi-value-description', style: 'margin-top:5px; margin-left:24px;' },
    _('If enabled, the torrent is saved in the database and will remain in the list after TorrServer restarts (shown as "In DB" when inactive). If disabled, the torrent exists only in memory and will be permanently lost after TorrServer restarts.'));
	container.appendChild(fileInput);
	container.appendChild(titleInput);
	container.appendChild(categoryInput);
	container.appendChild(posterInput);
	container.appendChild(dataInput);
	container.appendChild(E('div', { style: 'margin-bottom:10px;' }, [saveLabel, saveHint]));
	container.appendChild(E('div', { class: 'right' }, [
		E('button', {
			class: 'cbi-button cbi-button-action',
			click: function() {
				var files = fileInput.files;
				if (!files || files.length === 0) {
					ui.addNotification(null, E('p', _('Please select at least one .torrent file')));
					return;
				}
				var title = titleInput.value.trim();
				var category = categoryInput.value.trim();
				var poster = posterInput.value.trim();
				var data = dataInput.value.trim();
				var save = saveCheckbox.checked;
				uploadTorrentFiles(files, title, category, poster, data, save)
					.then(function(result) {
						ui.addNotification(null, E('p', _('File(s) uploaded successfully!')));
						ui.hideModal();
						setTimeout(function() { refreshTorrentList(); }, 500);
					})
					.catch(function(err) {
						ui.addNotification(null, E('p', _('Failed to upload file(s):') + ' ' + esc(err.message || err)));
					});
			}
		}, _('Upload')),
		E('button', { class: 'btn', click: ui.hideModal }, _('Cancel'))
	]));
	ui.showModal(_('Upload Torrent File(s)'), [container]);
};

function extractFilesFromData(torrent) {
    if (torrent.file_stats && Array.isArray(torrent.file_stats) && torrent.file_stats.length > 0) {
        return torrent.file_stats;
    }
    if (torrent.data) {
        try {
            var parsed = typeof torrent.data === 'string' ? JSON.parse(torrent.data) : torrent.data;
            if (parsed && parsed.TorrServer && parsed.TorrServer.Files && Array.isArray(parsed.TorrServer.Files)) {
                return parsed.TorrServer.Files.map(function(f) {
                    return { id: f.id !== undefined ? f.id : 0, path: f.path || '', length: f.length || 0 };
                });
            }
        } catch (e) {
            console.warn('Failed to parse torrent.data:', e);
        }
    }
    return [];
}

function getField(obj, name, defaultVal) {
    if (!obj) return defaultVal;
    if (obj[name] !== undefined && obj[name] !== null) return obj[name];
    var pascal = name.charAt(0).toUpperCase() + name.slice(1);
    if (obj[pascal] !== undefined && obj[pascal] !== null) return obj[pascal];
    return defaultVal;
}

function findMagnetForHash(magnetsHtml, targetHash) {
	if (!magnetsHtml || !targetHash) return null;
	try {
		var parser = new DOMParser();
		var doc = parser.parseFromString('<root>' + magnetsHtml + '</root>', 'text/html');
		var links = doc.querySelectorAll('a[href^="magnet:"]');
		var lowerHash = targetHash.toLowerCase();
		for (var i = 0; i < links.length; i++) {
			var href = links[i].getAttribute('href') || '';
			var m = href.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
			if (m && m[1].toLowerCase() === lowerHash) {
				return {
					href: href,
					trackerCount: (href.match(/&tr=/g) || []).length
				};
			}
		}
	} catch(e) {}
	return null;
}

function viewTorrentDetails(torrent) {
	var tHash = torrent.hash || torrent.Hash;
	if (!tHash) {
		ui.addNotification(null, E('p', _('Torrent hash is missing!')));
		return;
	}

	var container = E('div');
	var titleText = torrent.title || torrent.Title || torrent.name || torrent.Name || tHash || 'Torrent';
	container.appendChild(E('h3', { style: 'margin-bottom:10px;' }, esc(titleText)));

	var loadingDiv = E('div', { class: 'cbi-value-description', style: 'text-align:center; padding:20px;' }, _('Loading torrent data…'));
	container.appendChild(loadingDiv);

	ui.showModal(_('Torrent Details'), [container]);

	var refreshTimer = null;
	var isFetching = false;

	function renderDetails(freshTorrent, cacheData, magnetsHtml) {
		if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);

		var ft = freshTorrent || torrent;
		var files = extractFilesFromData(ft);
		if (files.length === 0) files = extractFilesFromData(torrent);

		var dHash       = ft.hash || torrent.hash || tHash;
		var dCategory   = ft.category || torrent.category || '';
		var dStat       = (ft.stat !== undefined && ft.stat !== null) ? ft.stat : ((torrent.stat !== undefined && torrent.stat !== null) ? torrent.stat : null);
		var dSize       = ft.torrent_size || torrent.torrent_size || 0;
		var dLoaded     = ft.loaded_size || 0;
		var dPreloaded  = ft.preloaded_bytes || 0;
		var dDownSpeed  = ft.download_speed || 0;
		var dUpSpeed    = ft.upload_speed || 0;
		var dActivePeers= ft.active_peers || 0;
		var dTotalPeers = ft.total_peers || 0;
		var dSeeders    = ft.connected_seeders || 0;
		var dPoster     = ft.poster || torrent.poster || '';

		var statusText  = dStat !== null ? getStatusText(dStat) : _('Unknown');

		var infoDiv = E('div', { class: 'cbi-section' });
		infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Hash: ')),
			E('div', { class: 'cbi-value-field' }, E('code', { style: 'word-break:break-all;' }, dHash ? esc(dHash) : '—'))
		]));
		if (dCategory) infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Category: ')),
			E('div', { class: 'cbi-value-field' }, esc(dCategory))
		]));
		infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Status: ')),
			E('div', { class: 'cbi-value-field' }, E('span', { id: 'td-status', style: 'font-weight:bold;' }, statusText))
		]));
		infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Total size: ')),
			E('div', { class: 'cbi-value-field' }, E('span', { id: 'td-size' }, fmtSize(dSize)))
		]));
		infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Downloaded: ')),
			E('div', { class: 'cbi-value-field' }, E('span', { id: 'td-downloaded' }, fmtSize(dLoaded)))
		]));
		infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Preloaded: ')),
			E('div', { class: 'cbi-value-field' }, E('span', { id: 'td-preloaded' }, fmtSize(dPreloaded)))
		]));
		infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Download speed: ')),
			E('div', { class: 'cbi-value-field' }, E('span', { id: 'td-downspeed' }, fmtSpeed(dDownSpeed)))
		]));
		infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Upload speed: ')),
			E('div', { class: 'cbi-value-field' }, E('span', { id: 'td-upspeed' }, fmtSpeed(dUpSpeed)))
		]));
		infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Peers: ')),
			E('div', { class: 'cbi-value-field' }, E('span', { id: 'td-peers' }, dActivePeers + ' / ' + dTotalPeers))
		]));
		infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Seeders: ')),
			E('div', { class: 'cbi-value-field' }, E('span', { id: 'td-seeders' }, String(dSeeders)))
		]));
		if (dPoster) infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Poster: ')),
			E('div', { class: 'cbi-value-field' }, E('img', { src: dPoster, style: 'max-width:200px; max-height:150px; margin-top:5px;' }))
		]));

		// ---------- Трекеры и магнет-ссылка ----------
		var magnetInfo = findMagnetForHash(magnetsHtml, dHash);
		if (magnetInfo) {
			infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Trackers:')),
				E('div', { class: 'cbi-value-field' }, String(magnetInfo.trackerCount))
			]));
			infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Magnet link:')),
				E('div', { class: 'cbi-value-field' }, E('details', {}, [
					E('summary', { style: 'cursor:pointer; user-select:none;' }, _('Show magnet link')),
					E('div', { style: 'margin-top:6px; word-break:break-all;' }, [
						E('a', { href: magnetInfo.href, style: 'word-break:break-all;' }, esc(magnetInfo.href))
					])
				]))
			]));
		} else {
			infoDiv.appendChild(E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Trackers:')),
				E('div', { class: 'cbi-value-field cbi-value-description' }, _('N/A (magnet not found)'))
			]));
		}

		container.appendChild(infoDiv);

		// ---------- Индикатор автообновления ----------
		container.appendChild(E('div', { class: 'cbi-value-description', style: 'margin-bottom:15px; text-align:right;' },
			'🔄 ' + _('Auto-refresh: every 1 second')));

		// ---------- Файлы ----------
		if (files.length > 0) {
			container.appendChild(E('h4', { style: 'margin-top:15px; margin-bottom:10px;' },
				_('Files') + ' (' + files.length + ')'));
			var fileList = E('div', { style: 'max-height:200px; overflow-y:auto; margin-bottom:15px;' });
			files.forEach(function(file, index) {
				var filePath = file.path || file.Path || ('File ' + index);
				var fileSize = file.length || file.Length || 0;
				fileList.appendChild(E('div', {
					style: 'padding:6px 10px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;'
				}, [
					E('span', { style: 'word-break:break-all; flex:1;' }, esc(filePath)),
					E('span', { class: 'cbi-value-description', style: 'white-space:nowrap; margin-left:10px;' }, fmtSize(fileSize))
				]));
			});
			container.appendChild(fileList);
		}

		// ---------- Show raw JSON ----------
		container.appendChild(E('details', { style: 'margin-top:15px; margin-bottom:15px;' }, [
			E('summary', { style: 'cursor:pointer; font-weight:bold; padding:8px;' }, _('Show raw JSON')),
			E('pre', {
				id: 'td-raw-json',
				style: 'max-height:300px; overflow-y:auto; margin-top:10px;'
			}, JSON.stringify({ torrent: ft, cache: cacheData }, null, 2))
		]));

		// ---------- Нижние кнопки ----------
		container.appendChild(E('div', { class: 'right' }, [
			E('button', {
				class: 'cbi-button cbi-button-action',
				click: function() { openCacheStats(dHash); }
			}, _('Cache Stats')),
			E('button', {
				class: 'btn',
				click: function() {
					if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
					ui.hideModal();
				}
			}, _('Close'))
		]));
	}

	// ---------- Точечное обновление полей ----------
	function updateDynamicFields(ft) {
		var dStat       = (ft.stat !== undefined && ft.stat !== null) ? ft.stat : null;
		var dSize       = ft.torrent_size || 0;
		var dLoaded     = ft.loaded_size || 0;
		var dPreloaded  = ft.preloaded_bytes || 0;
		var dDownSpeed  = ft.download_speed || 0;
		var dUpSpeed    = ft.upload_speed || 0;
		var dActivePeers= ft.active_peers || 0;
		var dTotalPeers = ft.total_peers || 0;
		var dSeeders    = ft.connected_seeders || 0;

		var statusText  = dStat !== null ? getStatusText(dStat) : _('Unknown');
		var el;
		el = document.getElementById('td-status');
		if (el) { el.textContent = statusText; }
		el = document.getElementById('td-size');
		if (el) el.textContent = fmtSize(dSize);
		el = document.getElementById('td-downloaded');
		if (el) el.textContent = fmtSize(dLoaded);
		el = document.getElementById('td-preloaded');
		if (el) el.textContent = fmtSize(dPreloaded);
		el = document.getElementById('td-downspeed');
		if (el) el.textContent = fmtSpeed(dDownSpeed);
		el = document.getElementById('td-upspeed');
		if (el) el.textContent = fmtSpeed(dUpSpeed);
		el = document.getElementById('td-peers');
		if (el) el.textContent = dActivePeers + ' / ' + dTotalPeers;
		el = document.getElementById('td-seeders');
		if (el) el.textContent = String(dSeeders);
		el = document.getElementById('td-raw-json');
		if (el) el.textContent = JSON.stringify({ torrent: ft }, null, 2);
	}

	function autoRefreshTick() {
		if (!document.body.contains(container)) {
			if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
			return;
		}
		if (isFetching) return;
		isFetching = true;

		getTorrentInfo(tHash).then(function(freshTorrent) {
			updateDynamicFields(freshTorrent);
			isFetching = false;
		}).catch(function() {
			isFetching = false;
		});
	}

	function startAutoRefresh() {
		if (refreshTimer) return;
		refreshTimer = setInterval(autoRefreshTick, 1000);
	}

	// ---------- Первый запрос данных ----------
	Promise.all([
		getTorrentInfo(tHash),
		getCacheStats(tHash),
		apiGetText('/magnets').catch(function() { return null; })
	]).then(function(results) {
		renderDetails(results[0], results[1], results[2]);
		startAutoRefresh();
	}).catch(function(err) {
		if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
		container.appendChild(E('div', { class: 'alert-message error' },
			_('Failed to load torrent details:') + ' ' + esc(err.message || err)));
		container.appendChild(E('div', { class: 'right' }, [
			E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
		]));
	});
};

function editTorrentInfo(torrent) {
	var container = E('div');
	container.appendChild(E('p', { class: 'cbi-section-descr' },
		_('Edit torrent metadata. Changes will be saved to the database.')));

	var titleInput = E('input', {
		type: 'text',
		class: 'cbi-input-text',
		value: torrent.title || '',
		placeholder: _('Torrent title'),
		style: 'width:100%;'
	});

	var categoryInput = E('input', {
		type: 'text',
		class: 'cbi-input-text',
		value: torrent.category || '',
		placeholder: _('Category'),
		style: 'width:100%;'
	});

	var posterInput = E('input', {
		type: 'text',
		class: 'cbi-input-text',
		value: torrent.poster || '',
		placeholder: _('Poster URL'),
		style: 'width:100%;'
	});

	var dataInput = E('textarea', {
		class: 'cbi-input-textarea',
		placeholder: _('Custom data (JSON)'),
		rows: 4,
		style: 'width:100%; font-family:monospace;'
	}, torrent.data || '');

	var formSection = E('div', { class: 'cbi-section' }, [
		E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title' }, _('Title')),
			E('div', { class: 'cbi-value-field' }, titleInput)
		]),
		E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title' }, _('Category')),
			E('div', { class: 'cbi-value-field' }, categoryInput)
		]),
		E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title' }, _('Poster URL')),
			E('div', { class: 'cbi-value-field' }, posterInput)
		]),
		E('div', { class: 'cbi-value' }, [
			E('label', { class: 'cbi-value-title' }, _('Custom Data')),
			E('div', { class: 'cbi-value-field' }, dataInput)
		])
	]);

	container.appendChild(formSection);

	container.appendChild(E('div', { class: 'cbi-page-actions right' }, [
		E('button', {
			class: 'cbi-button cbi-button-action',
			click: function() {
				var title = titleInput.value;
				var category = categoryInput.value;
				var poster = posterInput.value;
				var data = dataInput.value;
				setTorrentInfo(torrent.hash, title, category, poster, data)
					.then(function() {
						ui.addNotification(null, E('p', _('Torrent info updated successfully!')));
						ui.hideModal();
						setTimeout(function() { refreshTorrentList(); }, 500);
					})
					.catch(function(err) {
						ui.addNotification(null, E('p', _('Failed to update torrent info:') + ' ' + esc(err.message || err)));
					});
			}
		}, _('Save')),
		E('button', { class: 'btn', click: ui.hideModal }, _('Cancel'))
	]));

	ui.showModal(_('Edit Torrent Info'), [container]);
};

function confirmRemoveTorrent(hash) {
	if (!confirm(_('Are you sure you want to remove this torrent?'))) return;
	removeTorrent(hash)
		.then(function() {
			ui.addNotification(null, E('p', _('Torrent removed successfully!')));
			setTimeout(function() { refreshTorrentList(); }, 500);
		})
		.catch(function(err) {
			ui.addNotification(null, E('p', _('Failed to remove torrent:') + ' ' + esc(err.message || err)));
		});
};

function confirmWipeAll() {
	if (!confirm(_('Are you sure you want to remove ALL torrents? This action cannot be undone!'))) return;
	wipeAllTorrents()
		.then(function() {
			ui.addNotification(null, E('p', _('All torrents removed successfully!')));
			setTimeout(function() { refreshTorrentList(); }, 500);
		})
		.catch(function(err) {
			ui.addNotification(null, E('p', _('Failed to wipe torrents:') + ' ' + esc(err.message || err)));
		});
};

function streamFile(hash, index) {
	var url = getPlayUrl(hash, index);
	window.open(url, '_blank');
};

function downloadFile(hash, fileId, filename) {
	var url = getStreamUrl(hash, fileId, filename, { play: true, save: true });
    var safeFilename = filename || ('video_' + hash + '_' + fileId);
    var link = document.createElement('a');
    link.href = url;
    link.download = safeFilename;
    link.style.display = 'none';
    document.body.appendChild(link);
    ui.addNotification(null, E('p', _('Starting download:') + ' ' + esc(safeFilename)));
    link.click();
    setTimeout(function() { document.body.removeChild(link); }, 100);
};

function markFileViewed(hash, fileIndex) {
	setViewed(hash, fileIndex)
		.then(function() {
			ui.addNotification(null, E('p', _('File marked as viewed!')));
		})
		.catch(function(err) {
			ui.addNotification(null, E('p', _('Failed to mark as viewed:') + ' ' + esc(err.message || err)));
		});
};

function downloadTorrentM3U(hash) {
	var url = getPlaylistUrl(hash, false);
	window.open(url, '_blank');
};

function openCacheStats(hash) {
	var container = E('div');
	var loadingDiv = E('div', { class: 'cbi-value-description', style: 'text-align:center; padding:20px;' }, _('Loading cache data…'));
	container.appendChild(loadingDiv);

	ui.showModal(_('Cache Statistics'), [container]);

	var refreshTimer = null;
	var isFetching = false;

	function renderStats(cache) {
		if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);

		if (!cache || Object.keys(cache).length === 0) {
			container.appendChild(E('p', { class: 'cbi-value-description' }, _('No cache data available.')));
			container.appendChild(E('div', { class: 'right' }, [
				E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
			]));
			return;
		}

		var capacity = cache.Capacity || cache.capacity || 0;
		var filled = cache.Filled || cache.filled || 0;
		var piecesCount = cache.PiecesCount || cache.piecesCount || 0;
		var piecesLength = cache.PiecesLength || cache.piecesLength || 0;
		var readers = cache.Readers || cache.readers || [];
		var readersCount = Array.isArray(readers) ? readers.length : 0;
		var usagePercent = capacity > 0 ? Math.round((filled / capacity) * 100) : 0;

container.appendChild(E('div', { style: 'margin-bottom:15px;' }, [
    E('div', { class: 'cbi-progressbar' }, [
        E('div', { id: 'cs-progress-bar', style: 'width:' + usagePercent + '%' })
    ])
]));

		container.appendChild(E('div', { class: 'cbi-value-description', style: 'margin-bottom:12px; text-align:right;' },
			'🔄 ' + _('Auto-refresh: every 1 second')));

		var stats = E('div', { class: 'cbi-section' }, [
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Cache Capacity:')),
				E('div', { class: 'cbi-value-field' }, fmtSize(capacity))
			]),
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Cache Filled:')),
				E('div', { class: 'cbi-value-field' }, E('span', { id: 'cs-filled' }, fmtSize(filled) + ' (' + usagePercent + '%)'))
			]),
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Pieces Count:')),
				E('div', { class: 'cbi-value-field' }, String(piecesCount))
			]),
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Piece Size:')),
				E('div', { class: 'cbi-value-field' }, fmtSize(piecesLength))
			]),
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Active Readers:')),
				E('div', { class: 'cbi-value-field' }, E('span', { id: 'cs-readers' }, String(readersCount)))
			])
		]);
		container.appendChild(stats);

		container.appendChild(E('details', { style: 'margin-top:15px; margin-bottom:15px;' }, [
			E('summary', { style: 'cursor:pointer; font-weight:bold; padding:8px;' }, _('Show raw JSON')),
			E('pre', {
				id: 'cs-raw-json',
				style: 'max-height:300px; overflow-y:auto; margin-top:10px;'
			}, JSON.stringify(cache, null, 2))
		]));

		container.appendChild(E('div', { class: 'right' }, [
			E('button', {
    class: 'cbi-button cbi-button-reset',
    click: function() {
        if (confirm(_('Unload this torrent from memory? It will be stopped and cache will be cleared, but the torrent will remain in your list.'))) {
            dropCache(hash)
                .then(function() {
                    ui.addNotification(null, E('p', _('Torrent unloaded successfully!')));
                    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
                    ui.hideModal();
                })
                .catch(function(err) {
                    ui.addNotification(null, E('p', _('Failed to unload torrent:') + ' ' + esc(err.message || err)));
                });
        }
    }
}, _('Unload')),
			E('button', {
				class: 'btn',
				click: function() {
					if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
					ui.hideModal();
				}
			}, _('Close'))
		]));
	}

	function updateCacheFields(cache) {
		if (!cache) return;

		var capacity = cache.Capacity || cache.capacity || 0;
		var filled = cache.Filled || cache.filled || 0;
		var readers = cache.Readers || cache.readers || [];
		var readersCount = Array.isArray(readers) ? readers.length : 0;
		var usagePercent = capacity > 0 ? Math.round((filled / capacity) * 100) : 0;

		var el;

		el = document.getElementById('cs-filled');
		if (el) el.textContent = fmtSize(filled) + ' (' + usagePercent + '%)';

		el = document.getElementById('cs-readers');
		if (el) el.textContent = String(readersCount);

el = document.getElementById('cs-progress-bar');
if (el) el.style.width = usagePercent + '%';

		el = document.getElementById('cs-raw-json');
		if (el) el.textContent = JSON.stringify(cache, null, 2);
	}

	function autoRefreshTick() {
		if (!document.body.contains(container)) {
			if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
			return;
		}
		if (isFetching) return;
		isFetching = true;

		getCacheStats(hash).then(function(cache) {
			updateCacheFields(cache);
			isFetching = false;
		}).catch(function() {
			isFetching = false;
		});
	}

	function startAutoRefresh() {
		if (refreshTimer) return;
		refreshTimer = setInterval(autoRefreshTick, 1000);
	}

	getCacheStats(hash).then(function(cache) {
		renderStats(cache);
		startAutoRefresh();
	}).catch(function(err) {
		if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
		container.appendChild(E('div', { class: 'alert-message error' },
			_('Failed to load cache stats:') + ' ' + esc(err.message || err)));
		container.appendChild(E('div', { class: 'right' }, [
			E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
		]));
	});
};

function openViewedHistory() {
	Promise.all([
		listViewed(),
		listTorrents().catch(function() { return []; })
	]).then(function(results) {
		var viewed = results[0] || [];
		var torrents = results[1] || [];
		var hashToTitle = {};
		if (torrents && Array.isArray(torrents)) {
			torrents.forEach(function(t) {
				hashToTitle[(t.hash || '').toLowerCase()] = t.title || t.name || '';
			});
		}
		var container = E('div');
		if (!viewed || viewed.length === 0) {
			container.appendChild(E('p', {}, _('No viewing history yet.')));
		} else {
			var tableContainer = E('div', { style: 'max-height:400px; overflow-y:auto;' });
			var table = E('table', { class: 'table' }, [
				E('tr', { class: 'tr table-titles' }, [
					E('th', { class: 'th', style: 'text-align:left; width:45%;' }, _('Title') + ' / ' + _('Torrent Hash')),
					E('th', { class: 'th', style: 'text-align:center; width:12%;' }, _('File Index')),
					E('th', { class: 'th', style: 'text-align:right; width:20%;' }, _('Timecode')),
					E('th', { class: 'th', style: 'text-align:center; width:23%;' }, _('Actions'))
				])
			]);
			viewed.forEach(function(v) {
				var title = hashToTitle[(v.hash || '').toLowerCase()] || '';
				var titleCell;
				if (title) {
					titleCell = E('td', { class: 'td', style: 'text-align:left;' }, [
						E('div', { style: 'font-weight:bold; margin-bottom:3px;' }, esc(title)),
						E('div', {}, E('code', { style: 'word-break:break-all;' }, esc(v.hash)))
					]);
				} else {
					titleCell = E('td', { class: 'td' }, E('code', { style: 'word-break:break-all;' }, esc(v.hash)));
				}
				table.appendChild(E('tr', { class: 'tr' }, [
					titleCell,
					E('td', { class: 'td', style: 'text-align:center;' }, String(v.file_index)),
					E('td', { class: 'td', style: 'text-align:right;' }, v.timecode ? v.timecode.toFixed(2) + 's' : '—'),
					E('td', { class: 'td', style: 'text-align:center;' }, [
						E('button', {
							class: 'cbi-button cbi-button-reset',
							click: function() { confirmRemoveViewed(v.hash, v.file_index); }
						}, _('Remove'))
					])
				]));
			});
			tableContainer.appendChild(table);
			container.appendChild(tableContainer);
		}
		container.appendChild(E('div', { class: 'right' }, [
			E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
		]));
		ui.showModal(_('Viewing History'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to load viewing history:') + ' ' + esc(err.message || err)));
	});
};

function confirmRemoveViewed(hash, fileIndex) {
	if (!confirm(_('Remove this entry from viewing history?'))) return;
	removeViewed(hash, fileIndex)
		.then(function() {
			ui.addNotification(null, E('p', _('Entry removed from viewing history!')));
			setTimeout(function() { openViewedHistory(); }, 500);
		})
		.catch(function(err) {
			ui.addNotification(null, E('p', _('Failed to remove entry:') + ' ' + esc(err.message || err)));
		});
};

function openServerSettings() {
	getSettings().then(function(settings) {
		var container = E('div');
		container.appendChild(E('p', { class: 'cbi-section-descr' },
			_('Current TorrServer settings. You can view and modify these settings.')));

		var settingsList = E('div', { class: 'cbi-section', style: 'max-height:350px; overflow-y:auto; margin-bottom:15px;' });
		var importantSettings = [
			{ key: 'retrackersMode', label: _('Retrackers Mode') },
			{ key: 'enableIPv6', label: _('Enable IPv6') },
			{ key: 'enableDLNA', label: _('Enable DLNA') },
			{ key: 'enableBonjour', label: _('Enable Bonjour') },
			{ key: 'enableRutorSearch', label: _('Enable Rutor Search') },
			{ key: 'enableTorznabSearch', label: _('Enable Torznab Search') },
			{ key: 'enableDebug', label: _('Enable Debug') },
			{ key: 'cacheSize', label: _('Cache Size (MB)') },
			{ key: 'preloadCache', label: _('Preload Cache (%)') },
			{ key: 'connectionsLimit', label: _('Connections Limit') },
			{ key: 'uploadRateLimit', label: _('Upload Rate Limit (KB/s)') },
			{ key: 'downloadRateLimit', label: _('Download Rate Limit (KB/s)') },
			{ key: 'friendlyName', label: _('Friendly Name') },
			{ key: 'storeSettingsInJson', label: _('Store Settings in JSON') },
			{ key: 'storeViewedInJson', label: _('Store Viewed in JSON') },
			{ key: 'trackTimecode', label: _('Track Timecode') }
		];

		importantSettings.forEach(function(item) {
			if (settings[item.key] !== undefined) {
				var valueDisplay = settings[item.key];
				if (typeof valueDisplay === 'boolean') {
					valueDisplay = valueDisplay ? _('Enabled') : _('Disabled');
				}
				settingsList.appendChild(E('div', {
					class: 'cbi-value',
					style: 'margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;'
				}, [
					E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, item.label),
					E('span', { class: 'cbi-value-field', style: 'font-weight:bold;' }, String(valueDisplay))
				]));
			}
		});
		container.appendChild(settingsList);

		container.appendChild(E('div', { class: 'cbi-page-actions', style: 'margin-bottom:15px;' }, [
			E('button', {
				class: 'cbi-button cbi-button-neutral',
				click: function() { openSettingsForm(); }
			}, _('Settings Editor')),
                        E('button', {
				class: 'cbi-button cbi-button-neutral',
				click: function() { openStorageSettings(); }
			}, _('Storage')),
			E('button', {
				class: 'cbi-button cbi-button-neutral',
				click: function() { openTMDBSettings(); }
			}, _('TMDB')),
			E('button', {
				class: 'cbi-button cbi-button-neutral',
				click: function() { openGStreamerSettings(); }
			}, _('GStreamer'))
		]));

		container.appendChild(E('h4', { style: 'margin-top:15px; margin-bottom:10px;' }, _('Full Settings JSON')));
                container.appendChild(E('pre', {
                    style: 'max-height:300px; overflow-y:auto;'
                }, JSON.stringify(settings, null, 2)));

		container.appendChild(E('div', { class: 'right' }, [
			E('button', {
				class: 'cbi-button cbi-button-reset',
				click: function() {
					if (confirm(_('Reset ALL settings to defaults? This cannot be undone!'))) {
						resetSettingsToDefaults()
							.then(function() {
								ui.addNotification(null, E('p', _('Settings reset to defaults!')));
								ui.hideModal();
							})
							.catch(function(err) {
								ui.addNotification(null, E('p', _('Failed to reset settings:') + ' ' + esc(err.message || err)));
							});
					}
				}
			}, _('Reset to Defaults')),
			E('button', {
				class: 'cbi-button cbi-button-reset',
				click: function() {
					if (confirm(_('Shutdown TorrServer? You will need to start it manually or reboot the router.'))) {
						shutdownServer()
							.then(function() {
								ui.addNotification(null, E('p', _('Server shutdown command sent!')));
								ui.hideModal();
							})
							.catch(function(err) {
								ui.addNotification(null, E('p', _('Failed to shutdown server:') + ' ' + esc(err.message || err)));
							});
					}
				}
			}, _('Shutdown Server')),
			E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
		]));

		ui.showModal(_('TorrServer Settings'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to load settings:') + ' ' + esc(err.message || err)));
	});
};

// ==================== SETTINGS FORM EDITOR ====================
function openSettingsForm() {
	getSettings().then(function(settings) {
		var bitTorr = settings || {};
		var tmdb = bitTorr.TMDBSettings || {};

		var container = E('div');
		container.appendChild(E('p', { class: 'cbi-section-descr' },
			_('Convenient TorrServer settings editor. Changes are saved directly via API and applied immediately.')));

		function addSection(title) {
			container.appendChild(E('h4', { style: 'margin-top:20px; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;' }, title));
		}

		function addRow(label, element, description) {
			var children = [ element ];
			if (description) {
				children.push(E('div', { class: 'cbi-value-description', style: 'margin-top:3px; font-size:0.9em; color:#666;' }, description));
			}
			var row = E('div', { style: 'margin-bottom:12px; display:block;' }, [
				E('label', { style: 'display:block; font-weight:bold; margin-bottom:4px; text-align:left; float:none; width:auto;' }, label),
				E('div', { style: 'display:block; margin-left:0;' }, children)
			]);
			container.appendChild(row);
			return element;
		}

		function addFlag(label, key, desc) {
			var cb = E('input', { type: 'checkbox', class: 'cbi-input-checkbox', style: 'margin-right:8px;' });
			if (bitTorr[key]) cb.checked = true;

			var labelContainer = E('div', { style: 'display:inline-block;' }, [
				E('span', { style: 'font-weight:bold;' }, label)
			]);

			if (desc) {
				labelContainer.appendChild(E('div', { class: 'cbi-value-description', style: 'font-size:0.9em; color:#666; margin-top:2px;' }, desc));
			}

			var row = E('div', { style: 'margin-bottom:12px; display:flex; align-items:flex-start;' }, [
				cb,
				labelContainer
			]);
			container.appendChild(row);
			return cb;
		}

		addSection(_('Cache & Performance'));
		var cacheSizeMB = Math.round((bitTorr.CacheSize || 67108864) / (1024 * 1024));
		var elCacheSize = addRow(_('Cache Size (MB)'), E('input', { type: 'number', class: 'cbi-input-text', value: cacheSizeMB, style: 'width:150px;' }), _('Amount of RAM for stream caching.'));
		var elPreload = addRow(_('Cache Preload (%)'), E('input', { type: 'number', class: 'cbi-input-text', value: bitTorr.PreloadCache || 50, min: 0, max: 100, style: 'width:150px;' }), _('Percentage of cache to fill before starting playback.'));
		var elReaderReadAHead = addRow(_('Reader Read Ahead (%)'), E('input', { type: 'number', class: 'cbi-input-text', value: bitTorr.ReaderReadAHead || 95, min: 5, max: 100, style: 'width:150px;' }), _('Read ahead percentage (5-100%).'));
		var flagResponsive = addFlag(_('Responsive Mode'), 'ResponsiveMode', _('Enable responsive mode.'));
		var flagRemoveCache = addFlag(_('Remove Cache on Drop'), 'RemoveCacheOnDrop', _('Clear cache when torrent is dropped.'));
		var flagUseDisk = addFlag(_('Use Disk'), 'UseDisk', _('Use disk for caching instead of RAM.'));

		addSection(_('Connection & Network'));
		var elConnLimit = addRow(_('Connections Limit'), E('input', { type: 'number', class: 'cbi-input-text', value: bitTorr.ConnectionsLimit || 25, style: 'width:150px;' }));
		var elPeersPort = addRow(_('Peers Listen Port'), E('input', { type: 'number', class: 'cbi-input-text', value: bitTorr.PeersListenPort || 0, style: 'width:150px;' }), _('0 = random port'));
		var flagDisableTCP = addFlag(_('Disable TCP'), 'DisableTCP');
		var flagDisableUTP = addFlag(_('Disable uTP'), 'DisableUTP');
		var flagDisableDHT = addFlag(_('Disable DHT'), 'DisableDHT');
		var flagDisablePEX = addFlag(_('Disable PEX'), 'DisablePEX');
		var flagDisableUPNP = addFlag(_('Disable UPnP'), 'DisableUPNP');
		var flagEnableLPD = addFlag(_('Enable LPD'), 'EnableLPD', _('Local Peer Discovery'));
		var flagLPDIPv6 = addFlag(_('LPD IPv6'), 'LPDIPv6');
		var flagIPv6 = addFlag(_('Enable IPv6'), 'EnableIPv6');
		var flagForceEncrypt = addFlag(_('Force Encryption'), 'ForceEncrypt');
		var elTimeout = addRow(_('Torrent Disconnect Timeout (s)'), E('input', { type: 'number', class: 'cbi-input-text', value: bitTorr.TorrentDisconnectTimeout || 30, style: 'width:150px;' }));

		addSection(_('Speed Limits'));
		var elDownLimit = addRow(_('Download Rate Limit (KB/s)'), E('input', { type: 'number', class: 'cbi-input-text', value: bitTorr.DownloadRateLimit || 0, style: 'width:150px;' }), _('0 = unlimited'));
		var elUpLimit = addRow(_('Upload Rate Limit (KB/s)'), E('input', { type: 'number', class: 'cbi-input-text', value: bitTorr.UploadRateLimit || 0, style: 'width:150px;' }), _('0 = unlimited'));
		var flagDisableUpload = addFlag(_('Disable Upload'), 'DisableUpload', _('Disable torrent seeding (uploading).'));

		addSection(_('Features & Services'));
		var flagDLNA = addFlag(_('DLNA Server'), 'EnableDLNA', _('Enable DLNA for auto-discovery on the local network.'));
		var flagBonjour = addFlag(_('Enable Bonjour'), 'EnableBonjour', _('Bonjour/mDNS LAN discovery (_torrserver, _http, _https)'));
		var elFriendlyName = addRow(_('Device Name (DLNA/Bonjour)'), E('input', { type: 'text', class: 'cbi-input-text', value: bitTorr.FriendlyName || '', style: 'width:100%;' }), _('Shared name for DLNA and Bonjour'));
		var flagRutor = addFlag(_('Enable Rutor Search'), 'EnableRutorSearch');
		var flagTorznab = addFlag(_('Enable Torznab Search'), 'EnableTorznabSearch');

		// Torznab URLs - массив объектов {host, key, name}
		var torznabUrls = Array.isArray(bitTorr.TorznabUrls) ? bitTorr.TorznabUrls : [];
		var torznabContainer = E('div', { id: 'torznab-container', style: 'margin-top:5px;' });
		var torznabRows = [];

		function renderTorznabRows() {
			torznabContainer.innerHTML = '';
			torznabRows.forEach(function(row, idx) {
				var rowDiv = E('div', { style: 'display:flex; gap:5px; margin-bottom:5px; align-items:center;' }, [
					E('input', { type: 'text', class: 'cbi-input-text', placeholder: _('Name'), value: row.name || '', style: 'flex:1;' }),
					E('input', { type: 'text', class: 'cbi-input-text', placeholder: _('Host URL'), value: row.host || '', style: 'flex:2; padding:4px;' }),
					E('input', { type: 'text', class: 'cbi-input-text', placeholder: _('API Key'), value: row.key || '', style: 'flex:1;' }),
					E('button', {
						class: 'cbi-button cbi-button-reset',
						click: function() {
							torznabRows.splice(idx, 1);
							renderTorznabRows();
						}
					}, '×')
				]);
				torznabContainer.appendChild(rowDiv);
			});
		}

		torznabRows = torznabUrls.map(function(u) {
			return { name: u.name || '', host: u.host || '', key: u.key || '' };
		});
		renderTorznabRows();

		var torznabSection = E('div', { style: 'margin-bottom:12px;' }, [
			E('label', { style: 'display:block; font-weight:bold; margin-bottom:4px; text-align:left;' }, _('Torznab Indexers')),
			torznabContainer,
			E('button', {
				class: 'cbi-button cbi-button-action',
				style: 'margin-top:5px;',
				click: function() {
					torznabRows.push({ name: '', host: '', key: '' });
					renderTorznabRows();
				}
			}, _('+ Add Torznab Indexer')),
			E('div', { class: 'cbi-value-description', style: 'margin-top:3px; font-size:0.9em; color:#666;' }, _('Add Torznab-compatible indexers (Jackett, Prowlarr, etc.)'))
		]);
		container.appendChild(torznabSection);

		var flagTimecode = addFlag(_('Track Timecode'), 'TrackTimecode', _('Remember playback position to resume later.'));
		var flagShowFS = addFlag(_('Show FS Active Torr'), 'ShowFSActiveTorr');

		addSection(_('Storage & Files'));
		var flagSettingsJson = addFlag(_('Store Settings in JSON'), 'StoreSettingsInJson', _('If disabled, settings are stored in the config.db (BBolt) database.'));
		var flagViewedJson = addFlag(_('Store History in JSON'), 'StoreViewedInJson', _('If disabled, viewing history is stored in config.db (BBolt).'));
		var elSavePath = addRow(_('Torrents Save Path'), E('input', { type: 'text', class: 'cbi-input-text', value: bitTorr.TorrentsSavePath || '', style: 'width:100%;' }), _('Directory to save downloaded torrent files.'));

		addSection(_('SSL / HTTPS'));
		var elSslPort = addRow(_('SSL Port'), E('input', { type: 'number', class: 'cbi-input-text', value: bitTorr.SslPort || 0, style: 'width:150px;' }), _('0 = disabled'));
		var elSslCert = addRow(_('SSL Certificate Path'), E('input', { type: 'text', class: 'cbi-input-text', value: bitTorr.SslCert || '', style: 'width:100%;' }));
		var elSslKey = addRow(_('SSL Key Path'), E('input', { type: 'text', class: 'cbi-input-text', value: bitTorr.SslKey || '', style: 'width:100%;' }));

		addSection(_('Debug & Advanced'));
		var flagDebug = addFlag(_('Debug Mode'), 'EnableDebug', _('Enable detailed logging (Debug).'));

		addSection(_('Retrackers'));
		var elRetrackers = addRow(_('Retrackers Mode'),
			E('select', { class: 'cbi-input-select', style: 'width:250px;' }, [
				E('option', { value: '0', selected: bitTorr.RetrackersMode === 0 }, _('0 - Don\'t add')),
				E('option', { value: '1', selected: bitTorr.RetrackersMode === 1 || bitTorr.RetrackersMode === undefined }, _('1 - Add retrackers (default)')),
				E('option', { value: '2', selected: bitTorr.RetrackersMode === 2 }, _('2 - Remove retrackers')),
				E('option', { value: '3', selected: bitTorr.RetrackersMode === 3 }, _('3 - Replace retrackers'))
			]));

		addSection(_('TMDB Settings'));
		var elTmdbKey = addRow(_('TMDB API Key'), E('input', { type: 'text', class: 'cbi-input-text', value: tmdb.APIKey || '', style: 'width:100%;' }), _('Used to download movie posters and descriptions.'));
		var elTmdbApiUrl = addRow(_('TMDB API URL'), E('input', { type: 'text', class: 'cbi-input-text', value: tmdb.APIURL || 'https://api.themoviedb.org', style: 'width:100%;' }));
		var elTmdbImgUrl = addRow(_('TMDB Image URL'), E('input', { type: 'text', class: 'cbi-input-text', value: tmdb.ImageURL || 'https://image.tmdb.org', style: 'width:100%;' }));
		var elTmdbImgUrlRu = addRow(_('TMDB Image URL (RU)'), E('input', { type: 'text', class: 'cbi-input-text', value: tmdb.ImageURLRu || 'https://imagetmdb.com', style: 'width:100%;' }));

		container.appendChild(E('div', { class: 'cbi-page-actions right', style: 'margin-top:20px;' }, [
    E('button', {
    class: 'cbi-button cbi-button-action',
    id: 'ts-settings-save-btn',
    click: function(ev) {
        var btn = ev.currentTarget;
        btn.disabled = true;
        btn.textContent = _('Saving…');
        btn.classList.remove('cbi-button-action');
        btn.classList.add('btn');

        var newSettings = {};
        var b = newSettings;

        b.CacheSize = parseInt(elCacheSize.value, 10) * 1024 * 1024;
        b.PreloadCache = parseInt(elPreload.value, 10);
        b.ReaderReadAHead = parseInt(elReaderReadAHead.value, 10);
        b.ResponsiveMode = flagResponsive.checked;
        b.RemoveCacheOnDrop = flagRemoveCache.checked;
        b.UseDisk = flagUseDisk.checked;

        b.ConnectionsLimit = parseInt(elConnLimit.value, 10);
        b.PeersListenPort = parseInt(elPeersPort.value, 10);
        b.DisableTCP = flagDisableTCP.checked;
        b.DisableUTP = flagDisableUTP.checked;
        b.DisableDHT = flagDisableDHT.checked;
        b.DisablePEX = flagDisablePEX.checked;
        b.DisableUPNP = flagDisableUPNP.checked;
        b.EnableLPD = flagEnableLPD.checked;
        b.LPDIPv6 = flagLPDIPv6.checked;
        b.EnableIPv6 = flagIPv6.checked;
        b.ForceEncrypt = flagForceEncrypt.checked;
        b.TorrentDisconnectTimeout = parseInt(elTimeout.value, 10);

        b.DownloadRateLimit = parseInt(elDownLimit.value, 10);
        b.UploadRateLimit = parseInt(elUpLimit.value, 10);
        b.DisableUpload = flagDisableUpload.checked;

        b.EnableDLNA = flagDLNA.checked;
        b.EnableBonjour = flagBonjour.checked;
        b.FriendlyName = elFriendlyName.value.trim();
        b.EnableRutorSearch = flagRutor.checked;
        b.EnableTorznabSearch = flagTorznab.checked;

        b.TorznabUrls = torznabRows
            .filter(function(r) { return r.host && r.host.trim(); })
            .map(function(r) { return { name: r.name.trim(), host: r.host.trim(), key: r.key.trim() }; });

        b.TrackTimecode = flagTimecode.checked;
        b.ShowFSActiveTorr = flagShowFS.checked;

        b.StoreSettingsInJson = flagSettingsJson.checked;
        b.StoreViewedInJson = flagViewedJson.checked;
        b.TorrentsSavePath = elSavePath.value.trim();

        b.SslPort = parseInt(elSslPort.value, 10);
        b.SslCert = elSslCert.value.trim();
        b.SslKey = elSslKey.value.trim();

        b.EnableDebug = flagDebug.checked;
        b.RetrackersMode = parseInt(elRetrackers.value, 10);

        b.TMDBSettings = {
            APIKey: elTmdbKey.value.trim(),
            APIURL: elTmdbApiUrl.value.trim(),
            ImageURL: elTmdbImgUrl.value.trim(),
            ImageURLRu: elTmdbImgUrlRu.value.trim()
        };

        setSettings(newSettings).then(function() {
            ui.addNotification(null, E('p', _('Settings saved successfully!')));
            ui.hideModal();
        }).catch(function(err) {
            btn.disabled = false;
            btn.textContent = _('Save');
            btn.classList.remove('btn');
            btn.classList.add('cbi-button-action');
            ui.addNotification(null, E('p', _('Save error: ') + esc(err.message)));
        });
    }
}, _('Save')),
    E('button', { class: 'btn', click: ui.hideModal }, _('Cancel'))
]));

		ui.showModal(_('TorrServer Settings (Form)'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to load settings: ') + esc(err.message)));
	});
};

function openServerInfo() {
	Promise.all([
		getServerVersion().catch(function() { return null; }),
		apiGetText('/stat').catch(function() { return null; })
	]).then(function(results) {
		var version = results[0];
		var statText = results[1];

		var container = E('div');

		var infoList = E('div', { class: 'cbi-section' }, [
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Version:')),
				E('div', { class: 'cbi-value-field' }, esc(version || _('N/A')))
			]),
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('API Base URL:')),
				E('div', { class: 'cbi-value-field' }, E('code', {}, getApiBase()))
			]),
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('Interactive API Documentation (Swagger UI):')),
				E('div', { class: 'cbi-value-field' },
					E('a', { href: getApiBase() + '/swagger/index.html', target: '_blank' }, _('Open Swagger UI')))
			]),
			E('p', { class: 'cbi-value-description', style: 'margin-bottom:10px;' }, [
			    E('strong', {}, 'Swagger UI'),
			    ' ' + _('provides an interactive web-based interface for exploring and testing all TorrServer REST API endpoints directly from your browser. You can view endpoint documentation, try API calls with real parameters, and see response formats without writing any code.')
			]),

			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title', style: 'padding:0; width:auto;' }, _('API Specification (OpenAPI 2.0 JSON):')),
				E('div', { class: 'cbi-value-field' },
					E('a', { href: getApiBase() + '/swagger/doc.json', target: '_blank' }, _('doc.json')))
			]),
			E('p', { class: 'cbi-value-description' }, [
			    E('strong', {}, 'doc.json'),
			    ' ' + _('contains the complete OpenAPI 2.0 specification in JSON format. This machine-readable file describes all API endpoints, parameters, request/response schemas, and authentication methods. It can be used by API clients, code generators, and documentation tools.')
			])
		]);
		container.appendChild(infoList);

		if (statText) {
			container.appendChild(E('h4', { style: 'margin-top:15px; margin-bottom:10px;' }, _('Server Statistics (raw output)')));
			container.appendChild(E('pre', {
				style: 'max-height:400px; overflow-y:auto; white-space:pre-wrap; word-break:break-all;'
			}, statText));
		} else {
			container.appendChild(E('div', { class: 'alert-message warning' },
				_('Could not load server statistics. TorrServer API may be unavailable.')));
		}

		container.appendChild(E('div', { class: 'right' }, [
			E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
		]));

		ui.showModal(_('Server Information'), [container]);
	}).catch(function(err) {
		ui.addNotification(null, E('p', _('Failed to get server info:') + ' ' + esc(err.message || err)));
	});
};

function downloadM3UPlaylist() {
	var url = getAllPlaylistUrl();
	window.open(url, '_blank');
};

// ==================== ORIGINAL FUNCTIONS ====================

function parseStats(stdout) {
	if (!stdout) return null;
	var p = stdout.trim().split('|');
	if (p.length < 12) return null;
	var cpuParts = p[9].trim().split(/\s+/);
	return {
		pid: p[0],
		user: p[1],
		rssKb: parseInt(p[2], 10) || 0,
		ticks: parseInt(p[3], 10) || 0,
		starttime: parseInt(p[4], 10) || 0,
		uptime: parseInt(p[5], 10) || 0,
		hz: parseInt(p[6], 10) || 100,
		cores: parseInt(p[7], 10) || 1,
		memAvailKb: parseInt(p[8], 10) || 0,
		cpuUser: parseInt(cpuParts[0], 10) || 0,
		cpuNice: parseInt(cpuParts[1], 10) || 0,
		cpuSystem: parseInt(cpuParts[2], 10) || 0,
		cpuIdle: parseInt(cpuParts[3], 10) || 0,
		cpuIowait: parseInt(cpuParts[4], 10) || 0,
		cpuIrq: parseInt(cpuParts[5], 10) || 0,
		cpuSoftirq: parseInt(cpuParts[6], 10) || 0,
		cpuSteal: parseInt(cpuParts[7], 10) || 0,
		procUptime: parseInt(p[10], 10) || 0,
		cmdline: p.slice(11).join('|').trim()
	};
}

function parseServerStat(statText) {
	if (!statText) return null;
	var result = {
		torrentsCount: null,
		bytesReadData: null,
		bytesWrittenData: null,
		bytesReadUsefulData: null,
		bannedIPs: null,
		listenPort: null,
		dhtNodes: null,
		dhtGoodNodes: null,
		peerId: null,
		announceKey: null,
		dhtNodeId: null,
		chunksRead: null,
		chunksReadUseful: null,
		chunksReadWasted: null,
		piecesDirtiedBad: null,
		outstandingTransactions: null,
		successfulAnnounces: null,
		trackersWorking: 0,
		trackersFailed: 0,
		activeTorrents: []
	};
	var lines = statText.split('\n');
	var currentTorrent = null;
	var inTrackers = false;

	for (var i = 0; i < lines.length; i++) {
		var line = lines[i].trim();
		var m;

		// Server-level stats
		if ((m = line.match(/^#\s*Torrents:\s*(\d+)/i))) {
			result.torrentsCount = parseInt(m[1], 10);
		} else if ((m = line.match(/^Listen port:\s*(\d+)/i))) {
			result.listenPort = parseInt(m[1], 10);
		} else if ((m = line.match(/^Banned IPs:\s*(\d+)/i))) {
			result.bannedIPs = parseInt(m[1], 10);
		} else if ((m = line.match(/^Peer ID:\s*"([^"]+)"/i))) {
			result.peerId = m[1];
		} else if ((m = line.match(/^Announce key:\s*([a-fA-F0-9]+)/i))) {
			result.announceKey = m[1];
		} else if ((m = line.match(/ID:\s*([a-fA-F0-9]{40})/)) && !result.dhtNodeId) {
			result.dhtNodeId = m[1];
		} else if ((m = line.match(/BytesReadData:\s*\(torrent\.Count\)\s*(\d+)/i))) {
			result.bytesReadData = parseInt(m[1], 10);
		} else if ((m = line.match(/BytesWrittenData:\s*\(torrent\.Count\)\s*(\d+)/i))) {
			result.bytesWrittenData = parseInt(m[1], 10);
		} else if ((m = line.match(/BytesReadUsefulData:\s*\(torrent\.Count\)\s*(\d+)/i))) {
			result.bytesReadUsefulData = parseInt(m[1], 10);
		} else if ((m = line.match(/GoodNodes:\s*\(int\)\s*(\d+)/i))) {
			result.dhtGoodNodes = parseInt(m[1], 10);
		} else if ((m = line.match(/^\s*Nodes:\s*\(int\)\s*(\d+)/i))) {
			result.dhtNodes = parseInt(m[1], 10);
		} else if ((m = line.match(/ChunksRead:\s*\(torrent\.Count\)\s*(\d+)/i))) {
			result.chunksRead = parseInt(m[1], 10);
		} else if ((m = line.match(/ChunksReadUseful:\s*\(torrent\.Count\)\s*(\d+)/i))) {
			result.chunksReadUseful = parseInt(m[1], 10);
		} else if ((m = line.match(/ChunksReadWasted:\s*\(torrent\.Count\)\s*(\d+)/i))) {
			result.chunksReadWasted = parseInt(m[1], 10);
		} else if ((m = line.match(/PiecesDirtiedBad:\s*\(torrent\.Count\)\s*(\d+)/i))) {
			result.piecesDirtiedBad = parseInt(m[1], 10);
		} else if ((m = line.match(/OutstandingTransactions:\s*\(int\)\s*(\d+)/i))) {
			result.outstandingTransactions = parseInt(m[1], 10);
		} else if ((m = line.match(/SuccessfulOutboundAnnouncePeerQueries:\s*\(int64\)\s*(\d+)/i))) {
			result.successfulAnnounces = parseInt(m[1], 10);
		}

		// Tracker stats
		if (line.indexOf('Enabled trackers:') === 0) {
			inTrackers = true;
			continue;
		}
		if (inTrackers) {
			if (line.match(/^[a-z]+:\/\/|^"[a-z]+:\/\//)) {
				if (line.indexOf('error') !== -1) {
					result.trackersFailed++;
				} else {
					result.trackersWorking++;
				}
			} else if (line.match(/^(DHT Announces|Num Pieces|Reader Pieces)/) || line === '') {
				inTrackers = false;
			}
		}
	}
	return result;
}

function collectStats() {
	return callTSProcessRaw().then(function(res) {
		if (!res || !res.ok || !res.stdout) return null;
		return parseStats(res.stdout);
	}).catch(function() { return null; });
}

var userInfoCache = null;

function getUserInfo() {
	if (userInfoCache) return Promise.resolve(userInfoCache);
	return callTSUserInfo('torrserver').then(function(res) {
		userInfoCache = (res && res.ok) ? res : { ok: false };
		return userInfoCache;
	}).catch(function() {
		userInfoCache = { ok: false };
		return userInfoCache;
	});
}

function renderUserInfo(fallbackUser) {
	return getUserInfo().then(function(info) {
		var elUser = document.getElementById('ts-user');
		var elGroup = document.getElementById('ts-prim-group');
		var elGroups = document.getElementById('ts-groups');
		if (!info || !info.ok) {
			if (elUser) elUser.textContent = fallbackUser || _('N/A');
			if (elGroup) elGroup.textContent = _('N/A');
			if (elGroups) elGroups.textContent = _('N/A');
			return;
		}
		if (elUser) elUser.textContent = info.user + ' (' + info.uid + ')';
		if (elGroup) elGroup.textContent = info.group + ' (' + info.gid + ')';
		if (elGroups) {
			var list = (info.groups || []).map(function(g) { return g.name + ' (' + g.gid + ')'; });
			elGroups.textContent = list.length ? list.join(', ') : (info.group + ' (' + info.gid + ')');
		}
	});
}
//new

var cpuTracker = (function() {
    var prevProc = null;
    var prevSys = null;

    function sysFieldsValid(s) {
        return !!(s && s.sysAvailable &&
            typeof s.cpuUser === 'number' && isFinite(s.cpuUser) &&
            typeof s.cpuNice === 'number' && isFinite(s.cpuNice) &&
            typeof s.cpuSystem === 'number' && isFinite(s.cpuSystem) &&
            typeof s.cpuIdle === 'number' && isFinite(s.cpuIdle) &&
            typeof s.cpuIowait === 'number' && isFinite(s.cpuIowait) &&
            typeof s.cpuIrq === 'number' && isFinite(s.cpuIrq) &&
            typeof s.cpuSoftirq === 'number' && isFinite(s.cpuSoftirq) &&
            typeof s.cpuSteal === 'number' && isFinite(s.cpuSteal));
    }

    return {
        compute: function(s) {
            if (!s) return _('N/A');

            var now = Date.now() / 1000;
            var procCpu = null;
            var sysCpu = null;
            var cores = s.cores || 1;

            if (prevProc && prevProc.pid === s.pid && s.ticks >= prevProc.ticks && now > prevProc.time) {
                procCpu = ((s.ticks - prevProc.ticks) / ((now - prevProc.time) * s.hz)) * 100;
            } else {
                var elapsed = s.uptime * s.hz - s.starttime;
                if (elapsed > 0) procCpu = (s.ticks / elapsed) * 100;
            }

            prevProc = { pid: s.pid, ticks: s.ticks, time: now };

            if (sysFieldsValid(s)) {
                var currTotal = s.cpuUser + s.cpuNice + s.cpuSystem + s.cpuIdle +
                                s.cpuIowait + s.cpuIrq + s.cpuSoftirq + s.cpuSteal;
                var currIdle = s.cpuIdle + s.cpuIowait;

                if (prevSys && currTotal >= prevSys.total) {
                    var totalDiff = currTotal - prevSys.total;

                    if (totalDiff === 0) {
                        sysCpu = 0;
                    } else {
                        var idleDiff = currIdle - prevSys.idle;
                        sysCpu = ((totalDiff - idleDiff) / totalDiff) * 100;

                        if (isNaN(sysCpu) || sysCpu < 0) sysCpu = 0;
                        if (sysCpu > 100) sysCpu = 100;
                    }
                }

                /*
                 * Если хочется, чтобы самый первый опрос показывал не Н/Д,
                 * а среднюю загрузку системы с момента загрузки, можно
                 * раскомментировать этот блок:
                 *
                 * if (sysCpu === null && currTotal > 0) {
                 *     sysCpu = ((currTotal - currIdle) / currTotal) * 100;
                 *     if (isNaN(sysCpu) || sysCpu < 0) sysCpu = 0;
                 *     if (sysCpu > 100) sysCpu = 100;
                 * }
                 */

                prevSys = { total: currTotal, idle: currIdle };
            } else {
                prevSys = null;
            }

            if (procCpu === null || isNaN(procCpu) || procCpu < 0) procCpu = 0;

            var solarisProcCpu = procCpu / cores;

            			if (sysCpu === null || isNaN(sysCpu)) {
				return Math.round(solarisProcCpu) + '% (' +
					_('system CPU free capacity remaining') + ': ' +
					_('N/A') + ')';
			}
			var freeCpu = 100 - Math.round(sysCpu);
			return Math.round(solarisProcCpu) + '% (' +
				_('system CPU has') + ' ' +
				freeCpu + '% ' +
				_('free capacity remaining for load') + ')';
        },

        reset: function() {
            prevProc = null;
            prevSys = null;
        }
    };
})();

var speedTracker = (function() {
	var prev = null;
	return {
		compute: function(serverStat) {
			if (!serverStat) return { down: null, up: null };
			var now = Date.now();
			var result = { down: null, up: null };
			if (prev && prev.bytesReadData !== null && serverStat.bytesReadData !== null) {
				var deltaSec = (now - prev.time) / 1000;
				if (deltaSec > 0.5) {
					var downDelta = serverStat.bytesReadData - prev.bytesReadData;
					var upDelta = serverStat.bytesWrittenData - prev.bytesWrittenData;
					if (downDelta >= 0) result.down = downDelta / deltaSec;
					if (upDelta >= 0) result.up = upDelta / deltaSec;
				}
			}
			prev = {
				time: now,
				bytesReadData: serverStat.bytesReadData,
				bytesWrittenData: serverStat.bytesWrittenData
			};
			return result;
		},
		reset: function() {
			prev = null;
		}
	};
})();

function waitForState(expectRunning, initialDelay, maxWait) {
	initialDelay = initialDelay || 0;
	maxWait = maxWait || 12000;
	return new Promise(function(resolve) {
		var started = Date.now();
		function check() {
			callTSStatus().then(function(res) {
				var running = !!(res && res.ok && res.running);
				if (running === expectRunning || (Date.now() - started) > maxWait) {
					resolve(running);
				} else {
					window.setTimeout(check, 600);
				}
			}).catch(function() {
				if ((Date.now() - started) > maxWait) resolve(false);
				else window.setTimeout(check, 600);
			});
		}
		window.setTimeout(check, initialDelay);
	});
}

var serviceActions = {
	enable: function() {
		var el = document.getElementById('ts-autostart');
		if (el) el.innerHTML = '<span style="color:#888; font-style:italic;">…</span>';
		return callTSService('enable').then(function() {
			if (el) el.innerHTML = autostartHtml(true);
			ui.addNotification(null, E('p', _('Autostart enabled.')));
		});
	},
	disable: function() {
		var el = document.getElementById('ts-autostart');
		if (el) el.innerHTML = '<span style="color:#888; font-style:italic;">…</span>';
		return callTSService('disable').then(function() {
			if (el) el.innerHTML = autostartHtml(false);
			ui.addNotification(null, E('p', _('Autostart disabled.')));
		});
	},
	listfiles: function() {
		openFileList();
	}
};

function handleServiceClick(ev) {
	var btn = ev.target.closest('[data-action]');
	if (!btn) return;
	ev.preventDefault();
	var action = btn.getAttribute('data-action');
	if (serviceActions[action]) {
		serviceActions[action]();
	}
}

function setEl(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}

function autostartHtml(isAutostart) {
    return '<div class="cbi-page-actions">' +
        '<button class="btn cbi-button-%s" data-action="%s">%s</button>'
            .format(
                isAutostart ? 'positive' : 'negative',
                isAutostart ? 'disable' : 'enable',
                isAutostart ? _('Enabled') : _('Disabled')
            ) +
        '</div>';
}

function updateAutostartButtons(isAutostart) {
    var btnEnable  = document.getElementById('cbid.torrserver.global._btn_autostart_enable');
    var btnDisable = document.getElementById('cbid.torrserver.global._btn_autostart_disable');

    if (btnEnable) {
        var rowEnable = btnEnable.closest('.cbi-value');
        if (rowEnable) rowEnable.style.display = isAutostart ? 'none' : '';
    }

    if (btnDisable) {
        var rowDisable = btnDisable.closest('.cbi-value');
        if (rowDisable) rowDisable.style.display = isAutostart ? '' : 'none';
    }
}

var apiUpdatePending = false;
function updateStatusCard() {
if (_statusFetching || !_pollsActive) return Promise.resolve();
var card = document.getElementById('ts-card');
if (!card) return Promise.resolve();
_statusFetching = true;

return callTSLoad().then(function(loadRes) {
_statusFetching = false;
if (!loadRes || !loadRes.ok) return;
try { sessionStorage.setItem('ts_last_running', (loadRes.service && loadRes.service.running) ? '1' : '0'); } catch(e) {}

        var service = loadRes.service || {};
        var proc = loadRes.proc || {};
        var running = !!service.running;
        var apiUpdatePending_local = false;

        // Process info from structured data
        if (proc.available && proc.pid) {
            setEl('ts-pid', esc(proc.pid));
            setEl('ts-user', esc(proc.user || 'unknown'));
            renderUserInfo(proc.user || null);

            var memStr = fmtMem(proc.rss_kb || 0);
            var memAvailStr = proc.mem_avail_kb ? fmtMem(proc.mem_avail_kb) : '';
            var memDisplay = memStr;
            if (memAvailStr) {
                memDisplay += ' (' + _('of system RAM') + ' ' + memAvailStr + ' ' + _('still available') + ')';
            }
            var memEl = document.getElementById('ts-mem');
            if (memEl) memEl.textContent = memDisplay;

            // CPU tracking
            var sys = loadRes.system_cpu || {};

            var statsForCpu = {
                pid: proc.pid,
                ticks: proc.cpu_ticks || 0,
                cores: proc.cores || 1,
                hz: 100,
                uptime: proc.uptime_sec || 0,
                starttime: 0,

                sysAvailable: !!(sys && sys.available),

                cpuUser: sys.user,
                cpuNice: sys.nice,
                cpuSystem: sys.system,
                cpuIdle: sys.idle,
                cpuIowait: sys.iowait,
                cpuIrq: sys.irq,
                cpuSoftirq: sys.softirq,
                cpuSteal: sys.steal
            };
            setEl('ts-cpu', esc(cpuTracker.compute(statsForCpu)));
            setEl('ts-cmd', esc(proc.cmdline || '—'));

            if (proc.uptime_sec > 0) {
                setEl('ts-proc-uptime', fmtUptime(proc.uptime_sec));
            }
        } else {
            setEl('ts-pid', _('N/A'));
            setEl('ts-user', _('N/A'));
            setEl('ts-mem', _('N/A'));
            setEl('ts-cpu', _('N/A'));
            setEl('ts-cmd', '—');
            setEl('ts-proc-uptime', _('N/A'));
            cpuTracker.reset();
        }

        // Service buttons visibility
        var btnStart   = document.getElementById('cbid.torrserver.global._btn_start');
        var btnRestart = document.getElementById('cbid.torrserver.global._btn_restart');
        var btnStop    = document.getElementById('cbid.torrserver.global._btn_stop');
        var anyBusy = false;
        [btnStart, btnRestart, btnStop].forEach(function(b) {
            if (b && b.disabled) anyBusy = true;
        });
        if (!anyBusy) {
            if (btnStart)   { var r = btnStart.closest('.cbi-value');   if (r) r.style.display = running ? 'none' : ''; }
            if (btnRestart) { var r = btnRestart.closest('.cbi-value'); if (r) r.style.display = running ? '' : 'none'; }
            if (btnStop)    { var r = btnStop.closest('.cbi-value');    if (r) r.style.display = running ? '' : 'none'; }
        }

        var warnEl = document.getElementById('ts-api-warning');

        if (!running) {
            apiUpdatePending = false;
            card.style.background = '#ffebee';
            card.style.borderLeftColor = '#dc3545';
            if (warnEl) warnEl.style.display = 'none';
            var st = document.getElementById('ts-state');
            if (st) {
                st.style.color = '#dc3545';
                st.textContent = '⏸ ' + _('Stopped');
            }

            // Show startup errors button if available
            if (loadRes.startup_errors) {
                var errEl = document.getElementById('ts-startup-errors');
                if (errEl) {
                    errEl.style.display = '';
                    errEl.textContent = '';

                    errEl.appendChild(
                        E('div', { 'class': 'ts-startup-error-box' }, [
                            E('strong', {}, '⚠ ' + _('Possible startup errors:') + ' '),
                            E('br'),
                            E('button', {
                                'class': 'btn',
                                'click': function() {
                                    openStartupErrorsLog(loadRes.startup_errors);
                                }
                            }, _('Show startup errors log'))
                        ])
                    );
                }
            }

            setEl('ts-version-api', _('N/A'));
            setEl('ts-speed-info', '—');
            setEl('ts-efficiency-info', '—');
            setEl('ts-wasted-info', '—');
            setEl('ts-dht-tx-info', '—');
            setEl('ts-corrupted-info', '—');
            setEl('ts-torrents-info', _('N/A'));
            setEl('ts-peerid-info', '—');
            setEl('ts-announcekey-info', '—');
            setEl('ts-dhtnodeid-info', '—');
            setEl('ts-trackers-info', '—');
            speedTracker.reset();
            return;
        }

        if (apiUpdatePending) return;
        apiUpdatePending = true;

        Promise.all([
            Promise.race([
                apiGetText('/echo').catch(function() { return null; }),
                new Promise(function(resolve) { window.setTimeout(function() { resolve(null); }, 3000); })
            ]),
            Promise.race([
                apiPost('/torrents', { action: 'list' }).catch(function() { return null; }),
                new Promise(function(resolve) { window.setTimeout(function() { resolve(null); }, 3000); })
            ]),
            Promise.race([
                apiGetText('/stat').catch(function() { return null; }),
                new Promise(function(resolve) { window.setTimeout(function() { resolve(null); }, 3000); })
            ])
        ]).then(function(results) {
            var echoText = results[0];
            var torrents = results[1];
            var statText = results[2];
            var isApiOk = !!echoText;
            var st = document.getElementById('ts-state');

            if (isApiOk) {
                card.style.background = '#e8f5e9';
                card.style.borderLeftColor = '#28a745';
                if (st) {
                    st.style.color = '#28a745';
                    st.textContent = '▶ ' + _('Running');
                }
                if (warnEl) warnEl.style.display = 'none';
                var errEl = document.getElementById('ts-startup-errors');
                if (errEl) {
                    errEl.style.display = 'none';
                    errEl.textContent = '';
                }
            } else {
                card.style.background = '#fff8e1';
                card.style.borderLeftColor = '#ffc107';
                if (st) {
                    st.style.color = '#ffc107';
                    st.textContent = '⚠ ' + _('Running, but API not responding');
                }
                if (warnEl) warnEl.style.display = '';
            }

            setEl('ts-version-api', echoText ? esc(echoText.trim()) : _('N/A'));

            if (torrents && Array.isArray(torrents)) {
                var stats = { total: torrents.length, working: 0, active: 0, paused: 0, inDb: 0 };
                for (var i = 0; i < torrents.length; i++) {
                    var stat = torrents[i].stat;
                    if (stat === 3) stats.working++;
                    else if (stat === 2) stats.active++;
                    else if (stat === 4) stats.paused++;
                    else if (stat === 0 || stat === 1 || stat === 5) stats.inDb++;
                }
                var torrentsInfoEl = document.getElementById('ts-torrents-info');
                if (torrentsInfoEl) {
                    torrentsInfoEl.textContent = formatTorrentStats(stats);
                }
            }

            if (statText) {
                var serverStat = parseServerStat(statText);
                if (serverStat) {
                    var trafficHtml = '';
                    if (serverStat.bytesReadData !== null || serverStat.bytesWrittenData !== null) {
                        trafficHtml = '↓ ' + fmtSize(serverStat.bytesReadData || 0) + ' / ↑ ' + fmtSize(serverStat.bytesWrittenData || 0);
                    }
                    setEl('ts-traffic-info', trafficHtml || _('N/A'));

                    var currentSpeed = speedTracker.compute(serverStat);
                    var speedHtml = '—';
                    if (currentSpeed.down !== null || currentSpeed.up !== null) {
                        speedHtml = '↓ ' + fmtSpeed(currentSpeed.down || 0) + ' / ↑ ' + fmtSpeed(currentSpeed.up || 0);
                    }
                    setEl('ts-speed-info', speedHtml);

                    var dhtHtml = '';
                    if (serverStat.dhtGoodNodes !== null) {
                        dhtHtml = serverStat.dhtGoodNodes + ' / ' + (serverStat.dhtNodes || 0) + ' ' + _('nodes');
                        if (serverStat.listenPort) {
                            dhtHtml += ' (' + _('port') + ' ' + serverStat.listenPort + ')';
                        }
                    }
                    setEl('ts-dht-info', dhtHtml || _('N/A'));
                    setEl('ts-banned-info', serverStat.bannedIPs !== null ? String(serverStat.bannedIPs) : _('N/A'));

                    var effHtml = '—';
                    if (serverStat.bytesReadData && serverStat.bytesReadData > 0 && serverStat.bytesReadUsefulData !== null) {
                        effHtml = Math.round((serverStat.bytesReadUsefulData / serverStat.bytesReadData) * 100) + '%';
                    }
                    setEl('ts-efficiency-info', effHtml);

                    var wastedHtml = '—';
                    if (serverStat.chunksRead !== null && serverStat.chunksRead > 0) {
                        var wastedPct = Math.round((serverStat.chunksReadWasted / serverStat.chunksRead) * 100);
                        wastedHtml = serverStat.chunksReadWasted + ' (' + wastedPct + '%)';
                    }
                    setEl('ts-wasted-info', wastedHtml);
                    setEl('ts-dht-tx-info', serverStat.outstandingTransactions !== null ? String(serverStat.outstandingTransactions) : '—');
                    setEl('ts-corrupted-info', serverStat.piecesDirtiedBad !== null ? String(serverStat.piecesDirtiedBad) : '—');
                    setEl('ts-peerid-info', serverStat.peerId || '—');
                    setEl('ts-announcekey-info', serverStat.announceKey || '—');
                    setEl('ts-dhtnodeid-info', serverStat.dhtNodeId || '—');

                    var trackersHtml = '—';
                    if (serverStat.trackersWorking > 0 || serverStat.trackersFailed > 0) {
                        var totalTr = serverStat.trackersWorking + serverStat.trackersFailed;
                        trackersHtml = serverStat.trackersWorking + ' / ' + totalTr + ' ' + _('working');
                        if (serverStat.trackersFailed > 0) {
                            trackersHtml += ' (' + serverStat.trackersFailed + ' ' + _('failed') + ')';
                        }
                    }
                    setEl('ts-trackers-info', trackersHtml);
                }
            }
            apiUpdatePending = false;
        }).catch(function() {
            apiUpdatePending = false;
        });
    }).catch(function() {
_statusFetching = false;
apiUpdatePending = false;
});
}


function updateDiskCard() {
if (_diskFetching || !_pollsActive) return Promise.resolve();
var card = document.getElementById('ts-disk-card');
if (!card) return Promise.resolve();
_diskFetching = true;

return callTSDisk().then(function(res) {
_diskFetching = false;
if (!res || !res.ok) return;
					if (res.df_stdout) {
				var dlines = res.df_stdout.trim().split('\n');
				if (dlines.length > 1) {
					var dparts = dlines[1].split(/\s+/);
					if (dparts.length >= 4) {
						var availMB = parseToMB(dparts[3]);
						var availStr = availMB + ' ' + _('MB');
						setEl('ts-disk-avail', availStr);
						setEl('ts-disk-avail-card', availStr);
					}
				}
			}
		var dbSize = (res.config_size >= 0) ? (res.config_size / 1024).toFixed(1) + ' ' + _('KB') : _('File does not exist');
		setEl('ts-db-size', esc(dbSize));
		setEl('ts-db-size-card', esc(dbSize));
	}).catch(function() {
_diskFetching = false;
});
}


function injectStyle() {
	if (document.getElementById('ts-style')) return;
	var st = document.createElement('style');
	st.id = 'ts-style';
	st.textContent =
		'#ts-card .ts-row{font-size:.9em;color:#555;margin-top:3px;}' +
		'#ts-cmd{font-family:monospace;font-size:.85em;word-break:break-all;}' +
		'#ts-disk-card .ts-row{font-size:.9em;color:#555;margin-top:3px;}' +
		'.ts-ip-info{background:#f8f9fa;border:1px solid #dee2e6;padding:12px 15px;border-radius:4px;font-size:.9em;color:#555;margin-top:10px;}' +
		'.ts-ip-info code{background:#e9ecef;padding:2px 6px;border-radius:3px;font-size:.85em;}' +
		'.ts-api-section{background:#f8f9fa;border:1px solid #dee2e6;padding:12px 15px;border-radius:4px;font-size:.9em;margin-top:10px;}' +
		'.ts-api-section h4{margin:0 0 8px 0;color:#333;}' +
		'.ts-api-table{width:100%;border-collapse:collapse;margin-top:8px;}' +
		'.ts-api-table th,.ts-api-table td{padding:6px 10px;text-align:left;border-bottom:1px solid #e9ecef;font-size:.85em;}' +
		'.ts-api-table th{background:#e9ecef;font-weight:600;}' +
		'.ts-api-table code{background:#fff3cd;padding:1px 4px;border-radius:2px;font-size:.8em;}' +
		'.torrent-manager table{border-collapse:collapse;}' +
		'.torrent-manager th,.torrent-manager td{padding:8px; border-bottom:1px solid #e9ecef;}' +
		'.torrent-manager th{background:#f8f9fa; font-weight:600;}'+

		'.ts-mono{font-family:monospace;font-size:.85em;}' +
		'.ts-section-divider{margin-top:6px;padding-top:6px;border-top:1px solid #e9ecef;}' +
		'.ts-api-warning{margin-top:8px;padding:8px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:3px;font-size:.85em;color:#856404;}' +
		'.ts-startup-error-box{margin-top:10px;padding:10px;background:#fff3cd;border:1px solid #ffc107;border-radius:3px;font-size:.85em;}' +
		'.ts-startup-error-box strong{color:#856404;}' +
		'.ts-startup-error-pre{margin:8px 0 0 0;padding:8px;background:#2d2d2d;color:#d4d4d4;border-radius:3px;font-size:.8em;white-space:pre-wrap;max-height:200px;overflow-y:auto;}';
	document.head.appendChild(st);
}

function openLiveTail(logname, title) {
    var offset = 0;
    var initialized = false;
    var liveInterval = null;
    var isLive = false;

    var logContainer = E('pre', {
        'class': 'ts-log-pre',
        style: 'max-height:500px; overflow:auto; background:#1e1e1e; color:#d4d4d4; padding:15px; font-family:monospace; white-space:pre; font-size:.85em; border:1px solid #444;'
    });

    var statusDiv = E('div', {
        style: 'margin-bottom:10px; padding:8px; background:#2d2d2d; border-radius:4px; font-family:monospace; font-size:.9em;'
    });

    var toggleButton = E('button', {
        'class': 'cbi-button cbi-button-action',
        style: 'margin-right:10px;'
    }, _('Start Live Tail'));

    var closeButton = E('button', { 'class': 'btn' }, _('Close'));

    function loadLogs() {
        return callTSLogRead(logname, offset, 65536).then(function(res) {
            if (!res || !res.ok) {
                if (!initialized) {
                    logContainer.textContent = _('Failed to read log file: ') + (res && res.error ? res.error : 'unknown error');
                }
                return;
            }

            if (!res.exists) {
                if (!initialized) {
                    logContainer.textContent = _('Log file is empty or does not exist yet.');
                }
                return;
            }

            if (initialized && typeof res.size === 'number' && res.size < offset) {
                logContainer.textContent = '';
                initialized = false;
                offset = 0;
            }

            var stick = !initialized ? true : tsIsNearBottom(logContainer);
            var oldScrollTop = logContainer.scrollTop;

            if (!initialized) {
                logContainer.textContent = res.content || '';
                initialized = true;
            } else if (res.content) {
                var span = document.createElement('span');
                span.style.color = '#4ec9b0';
                span.style.fontWeight = 'bold';
                span.textContent = res.content;

                logContainer.appendChild(span);

                setTimeout(function() {
                    span.style.color = '#d4d4d4';
                    span.style.fontWeight = 'normal';
                }, 3000);
            }

            if (typeof res.next === 'number') {
                offset = res.next;
            } else if (typeof res.size === 'number') {
                offset = res.size;
            }

            if (stick) {
                logContainer.scrollTop = logContainer.scrollHeight;
            } else {
                logContainer.scrollTop = oldScrollTop;
            }
        }).catch(function(err) {
            if (!initialized) {
                logContainer.textContent = _('Failed to read log file: ') + err;
            }
        });
    }

    function startLive() {
        if (isLive) return;

        isLive = true;
        toggleButton.textContent = _('Stop Live Tail');
        toggleButton.classList.remove('cbi-button-action');
        toggleButton.classList.add('cbi-button-reset');

        statusDiv.innerHTML = '<span style="color:#4ec9b0;">🔄 ' + _('Live tail active - updating every 1 second') + '</span>';
        liveInterval = setInterval(loadLogs, 1000);
    }

    function stopLive() {
        if (!isLive) return;

        isLive = false;
        toggleButton.textContent = _('Start Live Tail');
        toggleButton.classList.remove('cbi-button-reset');
        toggleButton.classList.add('cbi-button-action');

        statusDiv.innerHTML = '<span style="color:#888;">🔄 ' + _('Live tail paused') + '</span>';

        if (liveInterval) {
            clearInterval(liveInterval);
            liveInterval = null;
        }
    }

    toggleButton.onclick = function() {
        isLive ? stopLive() : startLive();
    };

    closeButton.onclick = function() {
        stopLive();
        ui.hideModal();
    };

    var toolbar = E('div', { 'class': 'ts-log-toolbar' }, [
        toggleButton,
        tsCopyButton(logContainer),
        closeButton
    ]);

    var logWrap = E('div', { 'class': 'ts-log-wrap' }, [logContainer]);

    var modalBody = E('div', { 'class': 'ts-log-modal' }, [
        statusDiv,
        toolbar,
        logWrap
    ]);

    tsEnableCtrlA(modalBody, logContainer);

    ui.showModal(title, [modalBody]);

    statusDiv.innerHTML = '<span style="color:#888;">' + _('Source: ') + esc(logname) + '</span>';

    loadLogs();
}

function openSyslogTail(title) {
    var liveInterval = null;
    var isLive = false;
    var initialized = false;

    var logContainer = E('pre', {
        'class': 'ts-log-pre',
        style: 'max-height:500px; overflow:auto; background:#1e1e1e; color:#d4d4d4; padding:15px; font-family:monospace; white-space:pre; font-size:.85em; border:1px solid #444;'
    });

    var statusDiv = E('div', {
        style: 'margin-bottom:10px; padding:8px; background:#2d2d2d; border-radius:4px; font-family:monospace; font-size:.9em;'
    });

    var toggleButton = E('button', {
        'class': 'cbi-button cbi-button-action',
        style: 'margin-right:10px;'
    }, _('Start Live Tail'));

    var closeButton = E('button', { 'class': 'btn' }, _('Close'));

    function setContent(content) {
        var stick = !initialized ? true : tsIsNearBottom(logContainer);
        var oldScrollTop = logContainer.scrollTop;

        logContainer.textContent = content;
        initialized = true;

        if (stick) {
            logContainer.scrollTop = logContainer.scrollHeight;
        } else {
            logContainer.scrollTop = oldScrollTop;
        }
    }

    function loadLogs() {
        return callTSLogRead('syslog', 0, 200).then(function(res) {
            if (!res || !res.ok) {
                setContent(_('Failed to read system log: ') + (res && res.error ? res.error : 'unknown error'));
                return;
            }

            setContent(res.content || _('No torrserver entries found in system log. Make sure the service has been started at least once.'));
        }).catch(function(err) {
            setContent(_('Failed to read system log: ') + err);
        });
    }

    function startLive() {
        if (isLive) return;

        isLive = true;
        toggleButton.textContent = _('Stop Live Tail');
        toggleButton.classList.remove('cbi-button-action');
        toggleButton.classList.add('cbi-button-reset');

        statusDiv.innerHTML = '<span style="color:#4ec9b0;">🔄 ' + _('Live tail active - updating every 2 seconds') + '</span>';
        liveInterval = setInterval(loadLogs, 2000);
    }

    function stopLive() {
        if (!isLive) return;

        isLive = false;
        toggleButton.textContent = _('Start Live Tail');
        toggleButton.classList.remove('cbi-button-reset');
        toggleButton.classList.add('cbi-button-action');

        statusDiv.innerHTML = '<span style="color:#888;">🔄 ' + _('Live tail paused') + '</span>';

        if (liveInterval) {
            clearInterval(liveInterval);
            liveInterval = null;
        }
    }

    toggleButton.onclick = function() {
        isLive ? stopLive() : startLive();
    };

    closeButton.onclick = function() {
        stopLive();
        ui.hideModal();
    };

    var toolbar = E('div', { 'class': 'ts-log-toolbar' }, [
        toggleButton,
        tsCopyButton(logContainer),
        closeButton
    ]);

    var logWrap = E('div', { 'class': 'ts-log-wrap' }, [logContainer]);

    var modalBody = E('div', { 'class': 'ts-log-modal' }, [
        statusDiv,
        toolbar,
        logWrap
    ]);

    tsEnableCtrlA(modalBody, logContainer);

    ui.showModal(title, [modalBody]);

    statusDiv.innerHTML = '<span style="color:#888;">' + _('Source: logread -e torrserver') + '</span>';

    loadLogs();
}

function openFileEditor(name, title, warningText, validationFn, defaultContent) {
	return callTSFileRead(name).then(function(res) {
		if (!res || !res.ok) {
			ui.addNotification(null, E('p', _('Failed to read file: ') + (res && res.error ? res.error : 'unknown error')));
			return;
		}
		var content = res.exists ? res.content : (defaultContent !== undefined ? defaultContent : '');
		var textarea = E('textarea', {
			style: 'width:100%; height:400px; font-family:monospace; padding:10px; box-sizing:border-box;',
			rows: 20
		}, content || '');
		var elements = [];
		if (warningText) {
			elements.push(E('p', { style: 'color:orange; font-weight:bold;' }, warningText));
		}
		if (!res.exists && defaultContent !== undefined) {
			elements.push(E('p', { style: 'color:#28a745;' }, _('File does not exist yet. It will be created when you save.')));
		}
		elements.push(textarea);
		elements.push(E('div', { class: 'right' }, [
			E('button', {
				class: 'cbi-button cbi-button-action',
				click: function() {
					var newContent = textarea.value;
					if (validationFn) {
						var validationResult = validationFn(null, newContent);
						if (validationResult !== true) {
							ui.addNotification(null, E('p', _('Validation error: ') + validationResult));
							return;
						}
					}
					callTSFileWrite(name, newContent).then(function(wres) {
						if (!wres || !wres.ok) {
							ui.addNotification(null, E('p', _('Failed to save: ') + (wres && wres.error ? wres.error : 'unknown error')));
							return;
						}
						ui.addNotification(null, E('p', _('File saved successfully!') + ' ' + _('Restart TorrServer to apply changes.')));
						ui.hideModal();
					});
				}
			}, _('Save')),
			E('button', {
				class: 'btn',
				click: ui.hideModal
			}, _('Cancel'))
		]));
		ui.showModal(title, elements);
	});
}

function openFileList() {
	var path = (uci.get('torrserver', 'global', 'path') || '/var/etc/torrserver').replace(/\/+$/, '');
	return callTSFileList().then(function(res) {
		if (!res || !res.ok) {
			ui.addNotification(null, E('p', _('Failed to list directory: ') + (res && res.error ? res.error : 'unknown error')));
			return;
		}
		var files = res.files || [];
		var content = E('div', { style: 'max-height:500px; overflow-y:auto;' });
		if (!files.length) {
			content.appendChild(E('p', {}, _('Directory is empty or does not exist.')));
		} else {
			var table = E('table', { class: 'table' }, [
				E('tr', { class: 'tr table-titles' }, [
					E('th', { class: 'th', style: 'text-align:left;' }, _('File name')),
					E('th', { class: 'th', style: 'text-align:right;' }, _('Size')),
					E('th', { class: 'th', style: 'text-align:right;' }, _('Modified'))
				])
			]);
			files.sort(function(a, b) {
				if (a.type === b.type) return a.name.localeCompare(b.name);
				return a.type === 'directory' ? -1 : 1;
			});
			files.forEach(function(f) {
				var size = f.type === 'directory' ? '—' : fmtSize(f.size || 0);
				var mtime = f.mtime ? new Date(f.mtime * 1000).toLocaleString() : '—';
				var icon = f.type === 'directory' ? '📁 ' : '📄 ';
				table.appendChild(E('tr', { class: 'tr' }, [
					E('td', { class: 'td', style: 'text-align:left;' }, icon + esc(f.name)),
					E('td', { class: 'td', style: 'text-align:right;' }, size),
					E('td', { class: 'td', style: 'text-align:right;' },
						E('span', { class: 'cbi-value-description' }, esc(mtime)))
				]));
			});
			content.appendChild(table);
		}
		ui.showModal(_('Files in') + ' ' + path, [
			content,
			E('div', { class: 'right' }, [
				E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
			])
		]);
	});
}

// ==================== BACKUP / RESTORE DIALOGS ====================
function openBackupDialog() {
    var container = E('div');
    container.appendChild(E('p', {}, _('Select a destination directory for the backup archive:')));

    var loadingDiv = E('div', { class: 'cbi-value-description', style: 'text-align:center; padding:10px;' }, _('Loading available mounts…'));
    container.appendChild(loadingDiv);

    var mountsContainer = E('div', { id: 'backup-mounts' });
    container.appendChild(mountsContainer);

    var customPathDiv = E('div', { style: 'margin-top:15px;' }, [
        E('label', { style: 'display:block; font-weight:bold; margin-bottom:4px;' }, _('Or enter custom path:')),
        E('input', {
            type: 'text',
            class: 'cbi-input-text',
            id: 'backup-custom-path',
            placeholder: '/tmp/torrserver_backups',
            style: 'width:100%;'
        }),
        E('div', { class: 'cbi-value-description', style: 'margin-top:3px;' },
            _('Must be an absolute path to a writable directory.'))
    ]);
    container.appendChild(customPathDiv);

    container.appendChild(E('div', { class: 'right' }, [
    E('button', {
        class: 'cbi-button cbi-button-action',
        click: function() {
            var customPath = document.getElementById('backup-custom-path').value.trim();
            if (!customPath) {
                ui.addNotification(null, E('p', _('Please enter a destination path or select a drive from the table above.')));
                return;
            }
            if (customPath.charAt(0) !== '/') {
                ui.addNotification(null, E('p', _('Path must be absolute (starting with /).')));
                return;
            }
            createBackup(customPath);
        }
    }, _('Backup to Custom Path')),
    E('button', { class: 'btn', click: ui.hideModal }, _('Cancel'))
]));

    ui.showModal(_('Create Backup'), [container]);

    callTSListMounts().then(function(res) {
        if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);

        if (!res || !res.ok || !res.mounts || res.mounts.length === 0) {
            mountsContainer.appendChild(E('div', { class: 'alert-message warning' },
                _('No mounted drives found. Use custom path below.')));
            return;
        }

        var table = E('table', { class: 'table' }, [
            E('tr', { class: 'tr table-titles' }, [
                E('th', { class: 'th', style: 'text-align:left;' }, _('Path')),
                E('th', { class: 'th', style: 'text-align:right;' }, _('Size')),
                E('th', { class: 'th', style: 'text-align:right;' }, _('Available')),
                E('th', { class: 'th', style: 'text-align:right;' }, _('Used')),
                E('th', { class: 'th', style: 'text-align:center;' }, _('Action'))
            ])
        ]);

        res.mounts.forEach(function(m) {
            table.appendChild(E('tr', { class: 'tr' }, [
                E('td', { class: 'td', style: 'font-family:monospace; font-size:.85em;' }, esc(m.path)),
                E('td', { class: 'td', style: 'text-align:right;' }, esc(m.size)),
                E('td', { class: 'td', style: 'text-align:right; font-weight:bold; color:#28a745;' }, esc(m.avail)),
                E('td', { class: 'td', style: 'text-align:right;' }, esc(m.used)),
                E('td', { class: 'td', style: 'text-align:center;' }, [
                    E('button', {
                        class: 'cbi-button cbi-button-action',
                        style: 'padding:2px 8px; font-size:.85em;',
                        click: function() { createBackup(m.path); }
                    }, _('Backup Here'))
                ])
            ]));
        });

        mountsContainer.appendChild(table);
    }).catch(function(err) {
        if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
        mountsContainer.appendChild(E('div', { class: 'alert-message error' },
            _('Failed to load mounts:') + ' ' + esc(err.message)));
    });
};

function createBackup(targetDir) {
    ui.addNotification(null, E('p', _('Creating backup in') + ' ' + esc(targetDir) + '…'));

    callTSBackupSave(targetDir).then(function(res) {
        if (res && res.ok) {
            ui.addNotification(null, E('div', { class: 'alert-message success' }, [
                E('p', {}, [
                    E('strong', {}, _('Backup created successfully!')),
                    E('br'),
                    _('Path:') + ' ',
                    E('code', {}, esc(res.path)),
                    E('br'),
                    _('Size:') + ' ' + fmtSize(res.size || 0),
                    E('br'),
                    _('Files:') + ' ' + esc(res.files || '').trim()
                ])
            ]));
            ui.hideModal();
        } else {
            ui.addNotification(null, E('p', _('Backup failed:') + ' ' + (res && res.error ? res.error : 'unknown error')));
        }
    }).catch(function(err) {
        ui.addNotification(null, E('p', _('Backup error:') + ' ' + esc(err.message)));
    });
};

function openRestoreDialog() {
    var container = E('div');
    container.appendChild(E('div', { class: 'alert-message warning' }, [
        E('strong', {}, _('Warning:')), ' ',
        _('Restoring from backup will overwrite current configuration files. TorrServer will be stopped during restoration and restarted afterwards.')
    ]));

    container.appendChild(E('p', {}, _('Enter the full path to the backup archive (.tar.gz):')));
    container.appendChild(E('input', {
        type: 'text',
        class: 'cbi-input-text',
        id: 'restore-archive-path',
        placeholder: '/tmp/torrserver_backups/torrserver_backup_20260825_120000.tar.gz',
        style: 'width:100%; font-family:monospace;'
    }));

    container.appendChild(E('div', { class: 'cbi-value-description', style: 'margin-top:5px;' },
        _('You can find backup files in the directory where you created them.')));

    container.appendChild(E('div', { class: 'right' }, [
        E('button', {
            class: 'cbi-button cbi-button-action',
            click: function() {
                var path = document.getElementById('restore-archive-path').value.trim();
                if (!path) {
                    ui.addNotification(null, E('p', _('Please enter the archive path.')));
                    return;
                }
                if (!confirm(_('Are you sure you want to restore from') + ':\n' + path + '\n\n' + _('This will overwrite current configuration!'))) {
                    return;
                }
                restoreBackup(path);
            }
        }, _('Restore')),
        E('button', { class: 'btn', click: ui.hideModal }, _('Cancel'))
    ]));

    ui.showModal(_('Restore from Backup'), [container]);
};

function restoreBackup(archivePath) {
    ui.addNotification(null, E('p', _('Restoring from backup… This may take a moment.')));

    callTSBackupRestore(archivePath).then(function(res) {
        if (res && res.ok) {
            ui.addNotification(null, E('div', { class: 'alert-message success' }, [
                E('p', {}, [
                    E('strong', {}, _('Backup restored successfully!')),
                    E('br'),
                    _('TorrServer has been restarted with the restored configuration.')
                ])
            ]));
            ui.hideModal();
            // Обновляем карточки статуса
            setTimeout(function() {
                updateStatusCard();
                updateDiskCard();
            }, 2000);
        } else {
            ui.addNotification(null, E('p', _('Restore failed:') + ' ' + (res && res.error ? res.error : 'unknown error') +
                ' (rc=' + (res && res.rc !== undefined ? res.rc : 'N/A') + ')'));
        }
    }).catch(function(err) {
        ui.addNotification(null, E('p', _('Restore error:') + ' ' + esc(err.message)));
    });
};

// ==================== STORAGE SELECTOR ====================
function openStorageSelector() {
    var container = E('div');
    container.appendChild(E('p', {}, _('Select a mounted drive for TorrServer storage. The "torrserver" subdirectory will be created automatically.')));

    var loadingDiv = E('div', { class: 'cbi-value-description', style: 'text-align:center; padding:10px;' }, _('Loading available mounts…'));
    container.appendChild(loadingDiv);

    var mountsContainer = E('div', { id: 'storage-mounts' });
    container.appendChild(mountsContainer);

    container.appendChild(E('div', { class: 'right' }, [
        E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
    ]));

    ui.showModal(_('Select Storage Location'), [container]);

    callTSListMounts().then(function(res) {
        if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);

        if (!res || !res.ok || !res.mounts || res.mounts.length === 0) {
            mountsContainer.appendChild(E('div', { class: 'alert-message warning' },
                _('No mounted drives found.')));
            return;
        }

        var table = E('table', { class: 'table' }, [
            E('tr', { class: 'tr table-titles' }, [
                E('th', { class: 'th', style: 'text-align:left;' }, _('Path')),
                E('th', { class: 'th', style: 'text-align:right;' }, _('Size')),
                E('th', { class: 'th', style: 'text-align:right;' }, _('Available')),
                E('th', { class: 'th', style: 'text-align:right;' }, _('Used')),
                E('th', { class: 'th', style: 'text-align:center;' }, _('Action'))
            ])
        ]);

        res.mounts.forEach(function(m) {
            var availNum = parseInt(m.avail, 10) || 0;
            if (m.path === '/tmp' && availNum < 10240) return;

            var basePath = m.path.replace(/\/+$/, '');
            var fullPath = basePath + '/torrserver';

            table.appendChild(E('tr', { class: 'tr' }, [
                E('td', { class: 'td', style: 'font-family:monospace; font-size:.85em;' }, [
                    E('div', { style: 'font-weight:bold;' }, esc(basePath)),
                    E('div', { style: 'color:#888; font-size:.8em; margin-top:2px;' }, '→ ' + esc(fullPath))
                ]),
                E('td', { class: 'td', style: 'text-align:right;' }, esc(m.size)),
                E('td', { class: 'td', style: 'text-align:right; font-weight:bold; color:#28a745;' }, esc(m.avail)),
                E('td', { class: 'td', style: 'text-align:right;' }, esc(m.used)),
                E('td', { class: 'td', style: 'text-align:center; white-space:nowrap;' }, [
                    E('button', {
                        class: 'cbi-button cbi-button-action',
                        style: 'padding:2px 6px; font-size:.8em; margin-right:3px;',
                        title: _('Use disk root: %s').format(basePath),
                        click: function() { selectStoragePath(basePath); }
                    }, _('Root')),
                    E('button', {
                        class: 'cbi-button cbi-button-action',
                        style: 'padding:2px 6px; font-size:.8em;',
                        title: _('Use subdirectory: %s').format(fullPath),
                        click: function() { selectStoragePath(fullPath); }
                    }, _('/torrserver'))
                ])
            ]));
        });

        mountsContainer.appendChild(table);
    }).catch(function(err) {
        if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
        mountsContainer.appendChild(E('div', { class: 'alert-message error' },
            _('Failed to load mounts:') + ' ' + esc(err.message)));
    });
};

function selectStoragePath(path) {
    // Ищем селектор _storage_type — реальный ID с префиксом widget.
    var storageSelect = document.getElementById('widget.cbid.torrserver.global._storage_type');
    if (!storageSelect) {
        // Запасной вариант — ищем <select> внутри обёртки
        var wrapper = document.getElementById('cbid.torrserver.global._storage_type');
        if (wrapper) storageSelect = wrapper.querySelector('select');
    }

    // Переключаем селектор на "custom"
    if (storageSelect) {
        storageSelect.value = 'custom';
        storageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Ждём, пока LuCI покажет поле path
    setTimeout(function() {
        var pathInput = document.getElementById('widget.cbid.torrserver.global.path');
        if (!pathInput) {
            // Запасной вариант — ищем <input> внутри обёртки
            var wrapper = document.getElementById('cbid.torrserver.global.path');
            if (wrapper) pathInput = wrapper.querySelector('input');
        }

        if (pathInput) {
            // Устанавливаем значение
            pathInput.value = path;
            // Триггерим события для LuCI
            pathInput.dispatchEvent(new Event('input', { bubbles: true }));
            pathInput.dispatchEvent(new Event('change', { bubbles: true }));
            // Визуальная подсветка
            pathInput.style.transition = 'background-color 0.3s, border-color 0.3s';
            pathInput.style.backgroundColor = '#d4edda';
            pathInput.style.borderColor = '#28a745';
            setTimeout(function() {
                pathInput.style.backgroundColor = '';
                pathInput.style.borderColor = '';
            }, 2500);
        } else {
            console.error('selectStoragePath: path input not found!');
        }
    }, 300);

    ui.hideModal();
    ui.addNotification(null, E('div', {}, [
        E('p', {}, [
            E('strong', { style: 'color:#28a745;' }, '✓ '),
            _('Storage path set to:'), ' ',
            E('code', { style: 'background:#e9ecef; padding:2px 6px; border-radius:3px;' }, esc(path))
        ]),
        E('p', { style: 'font-size:.9em; color:#666;' },
            _('Click "Save & Apply" at the bottom to confirm.'))
    ]));
};

return view.extend({
	load: function() {
		var fallback = [ { code: -1 }, { code: -1 }, { code: -1 }, null, { code: -1 }, null, null, null, null, null, null, null ];
		// ФАЗА 1: Быстрая загрузка (только локальные ubus-вызовы, без HTTP API)
		return Promise.all([
			uci.load('torrserver'),
			callTSCheckTools().catch(function() { return { ok: false }; })
		]).then(function(results) {
			var toolsRes = results[1] || {};
			if (toolsRes && toolsRes.ok) {
				toolsAvailable.ffprobe   = !!toolsRes.ffprobe;
				toolsAvailable.fuse      = !!toolsRes.fuse;
				toolsAvailable.ca_bundle = !!toolsRes.ca_bundle;
			}
			return Promise.all([
				callTSLoad().catch(function() { return { ok: false }; }),
				callTSDisk().catch(function() { return { ok: false }; })
			]);
		}).then(function(results) {
			var loadRes = results[0] || {};
			var diskRes = results[1] || {};
			var service = loadRes.service || {};
			var statusObj = { code: service.running ? 0 : -1 };
			var enabledObj = { code: service.enabled ? 0 : -1 };
			var dfObj = { code: diskRes.ok ? 0 : -1, stdout: diskRes.df_stdout || '' };
			var versionObj = { code: service.version_bin ? 0 : -1, stdout: service.version_bin || '' };
			var dbStat = (diskRes.config_size >= 0) ? { size: diskRes.config_size } : null;
			var settingsStat = (diskRes.settings_size >= 0) ? { size: diskRes.settings_size } : null;
			var viewedStat = (diskRes.viewed_size >= 0) ? { size: diskRes.viewed_size } : null;
			// Индексы 8-11 (API данные) оставляем пустыми, их подтянет poll
			return [ statusObj, enabledObj, dfObj, null, versionObj, dbStat, settingsStat, viewedStat,
					 { ok: false }, { ok: false }, { ok: false }, { ok: false }, loadRes ];
		}).catch(function(e) {
			console.error('torrserver: failed to load UCI config:', e);
			return fallback;
		});
	},

	render: function(data) {
		var m, s, o;
		var status = data[0] || {};
		var enabled = data[1] || {};
		var df_out = data[2] || {};
		var stats = data[3];
		var version_out = data[4] || {};
		var db_stat = data[5] || {};
		var settings_stat = data[6] || {};
		var viewed_stat = data[7] || {};
		var echo_result = data[8] || { ok: false };
		var torrents_result = data[9] || { ok: false };
		var stat_result = data[10] || { ok: false };
		var settings_result = data[11] || { ok: false };
		var loadRes = data[12] || {};

		var isApiOk = !!(echo_result && echo_result.ok === true);

		var binVersion = _('N/A');
		if (loadRes.service && loadRes.service.version_bin) {
			binVersion = loadRes.service.version_bin;
		}
		var apiVersion = _('N/A');
		if (echo_result && echo_result.ok && echo_result.version) {
			apiVersion = echo_result.version;
		}

		var torrentStats = { total: 0, active: 0, paused: 0, working: 0, inDb: 0 };
		if (torrents_result && torrents_result.ok && Array.isArray(torrents_result.data)) {
			torrentStats.total = torrents_result.data.length;
			for (var i = 0; i < torrents_result.data.length; i++) {
				var stat = torrents_result.data[i].stat;
				if (stat === 3) torrentStats.working++;
				else if (stat === 2) torrentStats.active++;
				else if (stat === 4) torrentStats.paused++;
				else if (stat === 0 || stat === 1 || stat === 5) torrentStats.inDb++;
			}
		}

		var serverStat = null;
		if (stat_result && stat_result.ok && stat_result.data) {
			serverStat = parseServerStat(stat_result.data);
		}

		var path = (uci.get('torrserver', 'global', 'path') || '/var/etc/torrserver').replace(/\/+$/, '');
		var settingsPath = path + '/settings.json';
		var accsPath = path + '/accs.db';
		var wipPath = path + '/wip.txt';
		var bipPath = path + '/bip.txt';
		var viewedPath = path + '/viewed.json';

		var isRunning = (status.code === 0);
		var isAutostart = (enabled.code === 0);
		var isIpControl = (uci.get('torrserver', 'global', 'ipcontrol') === '1');

		var pid = stats ? stats.pid : _('N/A');
		var user = stats ? esc(stats.user) : _('N/A');
		var rssMem = stats ? fmtMem(stats.rssKb) : _('N/A');
		var memAvailStr = stats && stats.memAvailKb ? fmtMem(stats.memAvailKb) : '';
		var rssMemDisplay = rssMem;
		if (memAvailStr) {
			rssMemDisplay += ' (' + _('of system RAM') + ' ' + memAvailStr + ' ' + _('still available') + ')';
		}
		var cpuStr = stats ? cpuTracker.compute(stats) : _('N/A');
		var cmdline = stats ? esc(stats.cmdline) : '—';
		var procUptimeHtml = stats && stats.procUptime > 0 ? fmtUptime(stats.procUptime) : _('N/A');

		var diskAvail = _('N/A');
		if (df_out.code === 0 && df_out.stdout) {
			var dlines = df_out.stdout.trim().split('\n');
			if (dlines.length > 1) {
				var dparts = dlines[1].split(/\s+/);
				if (dparts.length >= 4) {
					diskAvail = parseToMB(dparts[3]) + ' ' + _('MB');
				}
			}
		}
		var dbInfo = (db_stat && db_stat.size) ? (db_stat.size / 1024).toFixed(1) + ' ' + _('KB') : _('File does not exist');
		var settingsInfo = (settings_stat && settings_stat.size) ? (settings_stat.size / 1024).toFixed(1) + ' ' + _('KB') : _('File does not exist');
		var viewedInfo = (viewed_stat && viewed_stat.size) ? (viewed_stat.size / 1024).toFixed(1) + ' ' + _('KB') : _('File does not exist');

		m = new form.Map('torrserver', _('TorrServer'), _('TorrServer is a torrent stream server that allows you to watch torrents online without downloading them first. This page lets you configure the service, manage its settings, and monitor its status.'));

		// ==================== SERVICE STATUS ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('Service Status'));

		// ==================== DEPENDENCIES WARNING ====================
		if (!toolsAvailable.ca_bundle || !toolsAvailable.fuse || !toolsAvailable.ffprobe) {
			o = s.option(form.DummyValue, '_deps_warning', _('Optional Dependencies'));
			o.rawhtml = true;
			o.cfgvalue = function() {
				var html = '<div class="alert-message warning" style="margin-bottom:10px;">';
				html += '<strong>⚠ ' + _('Missing optional packages:') + '</strong><ul style="margin:5px 0 0 0; padding-left:20px;">';
				if (!toolsAvailable.ca_bundle) {
					html += '<li><code>ca-bundle</code> — ' + _('Required for HTTPS connections to external services (TMDB, Telegram, trackers). Install via:') + ' <code>opkg install ca-bundle</code></li>';
				}
				if (!toolsAvailable.fuse) {
					html += '<li><code>fuse-utils</code> — ' + _('Required for FUSE mounting of torrents. Install via:') + ' <code>opkg install fuse-utils</code></li>';
				}
				if (!toolsAvailable.ffprobe) {
					html += '<li><code>ffprobe</code> — ' + _('Required for media file probing (Probe button). Install via:') + ' <code>opkg install ffprobe</code></li>';
				}
				html += '</ul></div>';
				return html;
			};
		}

o = s.option(form.DummyValue, '_status_card', _('TorrServer Service'));
o.renderWidget = function(section_id, option_index, cfgvalue) {
    // --- Определяем начальный статус ---
    var statusColor, statusBg, statusIcon, statusText;
    var cachedRunning = null;
    try { cachedRunning = sessionStorage.getItem('ts_last_running'); } catch(e) {}

    if (isRunning) {
        statusColor = '#28a745'; statusBg = '#e8f5e9';
        statusIcon = '▶'; statusText = _('Running');
    } else if (cachedRunning === '1') {
        statusColor = '#888'; statusBg = '#f8f9fa';
        statusIcon = '⏳'; statusText = _('Checking…');
    } else {
        statusColor = '#dc3545'; statusBg = '#ffebee';
        statusIcon = '⏸'; statusText = _('Stopped');
    }

    // --- Вспомогательная функция для строк карточки ---
    function tsRow(label, valueEl, extraStyle) {
        var attrs = { 'class': 'ts-row' };
        if (extraStyle) attrs['style'] = extraStyle;
        return E('div', attrs, [
            E('strong', {}, label), ' ', valueEl
        ]);
    }
    function tsDivider(title) {
        return E('div', { 'class': 'ts-row ts-section-divider' }, [
            E('strong', {}, title)
        ]);
    }
    function tsSpan(id, text) {
        return E('span', { 'id': id }, text);
    }
    function tsMonoSpan(id, text) {
        return E('span', { 'id': id, 'class': 'ts-mono' }, text || '—');
    }

    // --- Начальные значения ---
    var trafficText = _('N/A');
    var dhtText = _('N/A');
    var bannedText = _('N/A');
    var effText = '—';
    var wastedText = '—';
    var dhtTxText = '—';
    var corruptedText = '—';
    var peerIdText = '—';
    var announceKeyText = '—';
    var dhtNodeIdText = '—';
    var trackersText = '—';

    if (serverStat) {
        if (serverStat.bytesReadData !== null || serverStat.bytesWrittenData !== null)
            trafficText = '↓ ' + fmtSize(serverStat.bytesReadData || 0) + ' / ↑ ' + fmtSize(serverStat.bytesWrittenData || 0);
        if (serverStat.dhtGoodNodes !== null) {
            dhtText = serverStat.dhtGoodNodes + ' / ' + (serverStat.dhtNodes || 0) + ' ' + _('nodes');
            if (serverStat.listenPort) dhtText += ' (' + _('port') + ' ' + serverStat.listenPort + ')';
        }
        if (serverStat.bannedIPs !== null) bannedText = String(serverStat.bannedIPs);
        if (serverStat.outstandingTransactions !== null) dhtTxText = String(serverStat.outstandingTransactions);
        if (serverStat.piecesDirtiedBad !== null) corruptedText = String(serverStat.piecesDirtiedBad);
        if (serverStat.bytesReadData > 0 && serverStat.bytesReadUsefulData !== null)
            effText = Math.round((serverStat.bytesReadUsefulData / serverStat.bytesReadData) * 100) + '%';
        if (serverStat.chunksRead > 0) {
            var wastedPct = Math.round((serverStat.chunksReadWasted / serverStat.chunksRead) * 100);
            wastedText = serverStat.chunksReadWasted + ' (' + wastedPct + '%)';
        }
        if (serverStat.peerId) peerIdText = serverStat.peerId;
        if (serverStat.announceKey) announceKeyText = serverStat.announceKey;
        if (serverStat.dhtNodeId) dhtNodeIdText = serverStat.dhtNodeId;
        if (serverStat.trackersWorking > 0 || serverStat.trackersFailed > 0) {
            var totalTr = serverStat.trackersWorking + serverStat.trackersFailed;
            trackersText = serverStat.trackersWorking + ' / ' + totalTr + ' ' + _('working');
            if (serverStat.trackersFailed > 0) trackersText += ' (' + serverStat.trackersFailed + ' ' + _('failed') + ')';
        }
    }

    // --- API Warning ---
    var apiWarning;
    if (isRunning) {
        apiWarning = E('div', { 'id': 'ts-api-warning', 'class': 'ts-api-warning', 'style': 'display:none;' }, [
            E('strong', {}, '⚠ ' + _('API unreachable') + ':'), ' ',
            _('Process is running but the REST API is not responding yet. TorrServer might still be initializing, or there may be an internal error. Check the logs for details.')
        ]);
    } else {
        apiWarning = E('div', { 'id': 'ts-api-warning', 'style': 'display:none;' });
    }

    // --- Собираем карточку ---
    var card = E('div', {
        'id': 'ts-card',
        'style': 'background:' + statusBg + '; border-left:4px solid ' + statusColor +
                  '; padding:12px 15px; border-radius:4px; transition:background .4s, border-color .4s;'
    }, [
        E('div', {
            'id': 'ts-state',
            'style': 'font-size:1.2em; font-weight:bold; color:' + statusColor + '; transition:color .4s;'
        }, statusIcon + ' ' + statusText),

        apiWarning,

        tsRow(_('Version (binary):'), tsSpan('ts-version-bin', binVersion), 'margin-top:8px;'),
        tsRow(_('Version (REST API):'), tsSpan('ts-version-api', apiVersion)),
        tsRow(_('Torrents:'), tsSpan('ts-torrents-info',
            (torrents_result && torrents_result.ok) ? formatTorrentStats(torrentStats) : _('N/A'))),

        tsDivider('📊 ' + _('BitTorrent Stats')),
        tsRow(_('BT Traffic (cumulative):'), tsSpan('ts-traffic-info', trafficText)),
        tsRow(_('Current speed (live):'), tsSpan('ts-speed-info', '—')),
        tsRow(_('Data efficiency:'), tsSpan('ts-efficiency-info', effText)),
        tsRow(_('Wasted chunks:'), tsSpan('ts-wasted-info', wastedText)),
        tsRow(_('Corrupted pieces:'), tsSpan('ts-corrupted-info', corruptedText)),
        tsRow(_('Trackers:'), tsSpan('ts-trackers-info', trackersText)),

        tsDivider('🌐 ' + _('Network & DHT')),
        tsRow(_('DHT:'), tsSpan('ts-dht-info', dhtText)),
        tsRow(_('Active DHT transactions:'), tsSpan('ts-dht-tx-info', dhtTxText)),
        tsRow(_('Banned IPs:'), tsSpan('ts-banned-info', bannedText)),
        tsRow(_('Peer ID (spoofed):'), tsMonoSpan('ts-peerid-info', peerIdText)),
        tsRow(_('Announce key:'), tsMonoSpan('ts-announcekey-info', announceKeyText)),
        tsRow(_('DHT Node ID:'), tsMonoSpan('ts-dhtnodeid-info', dhtNodeIdText)),

        tsDivider('⚙ ' + _('Process')),
        tsRow(_('Process PID:'), tsSpan('ts-pid', pid)),
        tsRow(_('User:'), tsSpan('ts-user', user)),
        tsRow(_('Primary group:'), tsSpan('ts-prim-group', _('N/A'))),
        tsRow(_('Supplementary groups:'), tsSpan('ts-groups', _('N/A'))),
        tsRow(_('Process uptime:'), tsSpan('ts-proc-uptime', procUptimeHtml)),
        tsRow(_('RAM usage by process (RSS):'), tsSpan('ts-mem', rssMemDisplay)),
        tsRow(_('CPU usage by process:'), tsSpan('ts-cpu', cpuStr)),
        tsRow(_('Available in TorrServer working directory:'), tsSpan('ts-disk-avail-card', diskAvail)),
        tsRow(_('BBolt database size (config.db):'), tsSpan('ts-db-size-card', dbInfo)),
        E('div', { 'class': 'ts-row', 'style': 'margin-top:6px;' }, [
            E('strong', {}, _('Full path with arguments:')), ' ',
            E('code', { 'id': 'ts-cmd' }, cmdline)
        ]),
        E('div', { 'id': 'ts-startup-errors', 'style': 'display:none;' })
    ]);

    return E('div', { 'class': 'cbi-value-field' }, card);
};

		o = s.option(form.Button, '_btn_start');
		o.title = _('Starting the service');
		o.inputtitle = _('Start');
		o.inputstyle = 'action';
		o.onclick = function() {
			return callTSService('start').then(function() {
				return waitForState(true, 300, 10000);
			}).then(function() {
				updateStatusCard();
				updateDiskCard();
			});
		};

		o = s.option(form.Button, '_btn_restart');
		o.title = _('Restarting the service');
		o.inputtitle = _('Restart');
		o.inputstyle = 'action';
		o.onclick = function() {
			return callTSService('restart').then(function() {
				return waitForState(true, 1500, 15000);
			}).then(function() {
				updateStatusCard();
				updateDiskCard();
				speedTracker.reset();
			});
		};

		o = s.option(form.Button, '_btn_stop');
		o.title = _('Stopping the service');
		o.inputtitle = _('Terminate');
		o.inputstyle = 'negative';
		o.onclick = function() {
			return callTSService('stop').then(function() {
				return waitForState(false, 0, 15000);
			}).then(function() {
				updateStatusCard();
				updateDiskCard();
				speedTracker.reset();
			});
		};

		// ==================== AUTOSTART BUTTONS ====================
		o = s.option(form.Button, '_btn_autostart_enable');
		o.title = _('Autostart of the service');
		o.inputtitle = _('Disabled');
		o.inputstyle = 'negative';
		o.onclick = function() {
			return callTSService('enable').then(function() {
				ui.addNotification(null, E('p', _('Autostart enabled.')));
				updateAutostartButtons(true);
			}).catch(function(err) {
				ui.addNotification(null, E('p', _('Failed to enable autostart:') + ' ' + esc(err.message || err)));
			});
		};

		o = s.option(form.Button, '_btn_autostart_disable');
		o.title = _('Autostart of the service');
		o.inputtitle = _('Enabled');
		o.inputstyle = 'positive';
		o.onclick = function() {
			return callTSService('disable').then(function() {
				ui.addNotification(null, E('p', _('Autostart disabled.')));
				updateAutostartButtons(false);
			}).catch(function(err) {
				ui.addNotification(null, E('p', _('Failed to disable autostart:') + ' ' + esc(err.message || err)));
			});
		};

		// ==================== API MANAGEMENT ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('TorrServer management via API'));
		o = s.option(form.DummyValue, '_torrent_api', _('Torrent Actions'));
		o.description = _('Manage torrents, watch video, and view history via TorrServer REST API.');
		o.cfgvalue = function() {
		    return E('div', { 'class': 'cbi-page-actions' }, [
		        E('button', {
		            'class': 'btn cbi-button-neutral',
		            'click': function() { openVideoWatcher(); }
		        }, [_('Watch Video')]),
		        E('button', {
		            'class': 'btn cbi-button-neutral',
		            'click': function() { openTorrentManager(); }
		        }, [_('Torrent Manager')]),
		        E('button', {
		            'class': 'btn cbi-button-neutral',
		            'click': function() { openViewedHistory(); }
		        }, [_('Viewing History')])
		    ]);
		};

		o = s.option(form.DummyValue, '_server_api', _('Server Actions'));
		o.description = _('Speed test, server settings, and server information via TorrServer REST API.');
		o.cfgvalue = function() {
		    return E('div', { 'class': 'cbi-page-actions' }, [
		        E('button', {
		            'class': 'btn cbi-button-neutral',
		            'click': function() { runSpeedTest(); }
		        }, [_('Speed Test')]),
		        E('button', {
		            'class': 'btn cbi-button-neutral',
		            'click': function() { openServerSettings(); }
		        }, [_('Server Settings')]),
		        E('button', {
		            'class': 'btn cbi-button-neutral',
		            'click': function() { openServerInfo(); }
		        }, [_('Server Info')])
		    ]);
		};

		// ==================== WEB INTERFACE ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('Web Interface'));
		o = s.option(form.DummyValue, '_links', _('Open Web Interface'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			return '<a href="' + esc(getApiBase()) + '" target="_blank" class="btn cbi-button-action">' +
				_('Open TorrServer UI') + ' (' + esc(getApiBase()) + ')</a>';
		};

		// ==================== STORAGE & DATABASE ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('Storage & Database'));
		o = s.option(form.ListValue, '_storage_type', _('Storage location for database and settings'));
		o.value('ram', _('RAM (/var/etc/torrserver)'));
		o.value('flash', _('ROM (/etc/torrserver)'));
		o.value('custom', _('Custom path'));
		o.default = 'ram';
		o.cfgvalue = function(section_id) {
			var p = uci.get('torrserver', section_id, 'path');
			if (!p || p === '/var/etc/torrserver') return 'ram';
			if (p === '/etc/torrserver') return 'flash';
			return 'custom';
		};
		o.write = function(section_id, value) {
			if (value === 'ram') {
				uci.set('torrserver', section_id, 'path', '');
			} else if (value === 'flash') {
				uci.set('torrserver', section_id, 'path', '/etc/torrserver');
			}
		};
		o.remove = function(section_id) {};

		var infoRam = s.option(form.DummyValue, '_info_ram', _(''));
		infoRam.depends('_storage_type', 'ram');
		infoRam.rawhtml = true;
		infoRam.cfgvalue = function() {
			return '<div class="alert-message info">' +
				'<h4>' + _('RAM (Temporary Storage)') + '</h4>' +
				'<p>' + _('Data is stored in RAM (/var/etc/torrserver).') + '</p>' +
				'<p><strong>' + _('Pros:') + '</strong> ' + _('High speed, no wear on router flash memory.') + '</p>' +
				'<p><strong>' + _('Cons:') + '</strong> ' + _('All settings, torrent database, and viewing history will be lost on reboot or power loss.') + '</p>' +
				'</div>';
		};

		var infoFlash = s.option(form.DummyValue, '_info_flash', _(''));
		infoFlash.depends('_storage_type', 'flash');
		infoFlash.rawhtml = true;
		infoFlash.cfgvalue = function() {
			return '<div class="alert-message warning">' +
				'<h4>' + _('ROM (Persistent Storage)') + '</h4>' +
				'<p>' + _('Data is stored in router internal memory (/etc/torrserver).') + '</p>' +
				'<p><strong>' + _('Pros:') + '</strong> ' + _('Settings and history persist across reboots.') + '</p>' +
				'<p><strong>' + _('Cons:') + '</strong> ' + _('Frequent write cycles (database/history updates, settings changes) wear out NAND flash memory, which can eventually kill the router. Router flash memory typically has limited write endurance. Use this mode only if you accept the risk of flash wear.') + '</p>' +
				'</div>';
		};

		var infoCustom = s.option(form.DummyValue, '_info_custom', _(''));
		infoCustom.depends('_storage_type', 'custom');
		infoCustom.rawhtml = true;
		infoCustom.cfgvalue = function() {
			return '<div class="alert-message success">' +
				'<h4>' + _('Custom Path') + '</h4>' +
				'<p>' + _('Stored in any permitted folder.') + '</p>' +
				'<p><strong>' + _('Pros:') + '</strong> ' + _('You can use any path and any mounted folder (external storage or internal memory), as long as it is accessible to the torrserver user.') + '</p>' +
				'<p><strong>' + _('Cons:') + '</strong> ' + _('Requires careful path selection to avoid overwriting important files, losing data, or wearing out write-sensitive memory.') + '</p>' +
				'</div>';
		};

		o = s.option(form.Value, 'path', _('Custom path'));
		o.depends('_storage_type', 'custom');
		o.description = _('Absolute path to a directory for TorrServer working files. Use the "Browse Drives" button below to select from mounted disks, or enter a path manually.') + ' ' +
			_('The directory will be created automatically with correct ownership (') + '<code>torrserver:torrserver</code>' + _(') if it does not exist.') + ' ' +
			_('Do not point this path to system directories (') + '<code>/etc</code>, <code>/usr</code>, <code>/bin</code>' + _(') or other application data — the script will refuse to operate there for security reasons.');
		o.validate = validateAbsPath;
		o.rmempty = false;
		o.remove = function(section_id) {};

		o = s.option(form.Button, '_browse_drives');
		o.depends('_storage_type', 'custom');
		o.title = _('Browse Drives');
		o.inputtitle = _('Browse Available Drives');
		o.description = _('Shows mounted USB drives, SD cards, and other storage devices. Click "Select" on any drive to automatically fill the path above with a "torrserver" subdirectory.');
		o.inputstyle = 'action';
		o.onclick = function() {
			openStorageSelector();
			return Promise.resolve();
		};

		o = s.option(form.DummyValue, '_disk_info', _('Disk Space'));
o.description = _('File presence in the working directory depends on TorrServer configuration:') + ' ' +
    '<code>config.db</code> — ' + _('always present; BBolt database storing torrents, and optionally settings/viewing history if BBolt storage is selected.') + ' ' +
    '<code>settings.json</code> — ' + _('exists only if JSON storage type is chosen for settings in TorrServer web UI.') + ' ' +
    '<code>viewed.json</code> — ' + _('exists only if JSON storage type is chosen for viewing history.') + ' ' +
    '<code>accs.db</code> — ' + _('created automatically when HTTP authentication is enabled; stores login:password pairs.') + ' ' +
    '<code>wip.txt</code> / <code>bip.txt</code> — ' + _('created when IP Access Control is enabled (whitelist/blacklist).') + ' ' +
    _('Files not required by the current configuration simply do not exist. This is normal and expected.');
o.cfgvalue = function() {
    return '<div id="ts-disk-card">' +
    '<div class="ts-row"><strong>' + _('Path to TorrServer working directory:') + '</strong> <code>' + esc(path) + '</code></div>' +
    '<div class="ts-row"><strong>' + _('Available in TorrServer working directory:') + '</strong> <span id="ts-disk-avail">' + esc(diskAvail) + '</span></div>' +
    '<div class="ts-row" style="margin-top:8px; padding-top:8px; border-top:1px solid #e9ecef;">' +
    '<span><code>config.db</code>: <strong id="ts-db-size">' + esc(dbInfo) + '</strong></span>' +
    '<div style="font-size:.85em; color:#666; margin-top:4px;">' +
    _('This is a binary key-value BBolt (BoltDB) database. It stores the list of added torrents and their states (paused, active, etc.). It may also store settings and viewing history depending on TorrServer web interface settings. This is a binary file — it cannot be edited as plain text. Special utilities are needed to view and edit it, but it is best to leave this specific file to the TorrServer program.') +
    '</div>' +
    '</div>' +
    '<div class="ts-row" style="margin-top:8px; padding-top:8px; border-top:1px solid #e9ecef;">' +
    '<button class="btn cbi-button-action" style="padding:4px 10px; font-size:.85em;" data-action="listfiles">' + _('View all files in TorrServer working directory') + '</button>' +
    '</div>' +
    '</div>';
};
o.renderWidget = function(section_id, option_index, cfgvalue) {
    var html = this.cfgvalue(section_id);
    var node = E('div', { 'class': 'cbi-value-field' });
    node.innerHTML = html;
    return node;
};

		o = s.option(form.Flag, 'rdb', _('Start in read-only database mode'));
		o.description = _('Starts TorrServer in read-only database mode. In this mode, the server will not write changes to the config.db database. Useful for testing, running from read-only storage, or protecting the database from accidental modifications. Torrents added in this mode will exist only in memory and will be lost after restart.');
		o.default = '0';

		o = s.option(form.DummyValue, '_uninstall_info', _(''));
		o.rawhtml = true;
		o.cfgvalue = function() {
			return '<div class="alert-message info" style="margin-top:10px;">' +
				'<h4>' + _('Data Persistence on Uninstall') + '</h4>' +
				'<p><strong>' + _('When the') + ' <code>luci-app-torrserver</code> ' + _('package is removed, the following data is') + ' ' +
				'<strong>' + _('NOT deleted') + '</strong> ' +
				_('and will be preserved after reinstall:') + '</strong></p>' +
				'<ul style="margin:8px 0; padding-left:20px;">' +
				'<li><code>' + esc(path) + '/</code> — ' + _('working directory containing') + ' <code>config.db</code>, <code>settings.json</code>, <code>viewed.json</code>, <code>accs.db</code>, <code>wip.txt</code>, <code>bip.txt</code>, <code>tg.cfg</code>, ' + _('and all torrent data stored in this location.') + '</li>' +
				'<li>' + _('All files edited or created via this LuCI interface (IP lists, HTTP credentials, Telegram config, etc.)') + '</li>' +
				'<li>' + _('Backup archives created via "Create Backup" feature') + '</li>' +
				'<li><code>/etc/config/torrserver</code> — ' + _('UCI configuration (ports, paths, flags, autostart settings)') + '</li>' +
				'</ul>' +
				'<p style="margin-top:10px;">' +
				'<strong>' + _('To completely remove all TorrServer data:') + '</strong> ' +
				_('run') + ' <code>rm -rf ' + esc(path) + '</code> ' + _('and optionally') + ' <code>rm -rf /etc/torrserver</code> ' +
				_('(if ROM storage was used)') + ' ' + _('via SSH after uninstalling the package.') +
				'</p>' +
				'</div>';
		};

		o = s.option(form.Button, '_storage_settings');
		o.title = _('Storage Type Configuration');
		o.inputtitle = _('Configure Storage');
		o.description = _('TorrServer allows you to choose between different storage types for settings and viewing history.') +
			' ' + _('This setting is managed via TorrServer REST API, not via UCI/OpenWrt configuration.') + '</strong>';
		o.inputstyle = 'action';
		o.onclick = function() {
			openStorageSettings();
			return Promise.resolve();
		};

		o = s.option(form.Button, '_editsettings_form');
		o.title = _('Configuration Files');
		o.inputtitle = _('Settings Editor (Form)');
		o.description = _('A convenient form to change TorrServer settings without manually editing the JSON file') +
			' ' + _('This setting is managed via TorrServer REST API, not via UCI/OpenWrt configuration.') + '</strong>';
		o.inputstyle = 'action';
		o.onclick = function() {
			openSettingsForm();
			return Promise.resolve();
		};

		o = s.option(form.Button, '_editsettings');
		o.title = _('Configuration Files');
		o.inputtitle = _('Edit settings.json');
		o.description = _('Application settings in JSON format. This file may not exist if TorrServer is configured to use BBolt database for settings (check TorrServer web UI settings). If the file does not exist, it will be created when you save.');
		o.inputstyle = 'action';
		o.onclick = function() {
			return openFileEditor(
				'settings',
				_('Edit settings.json'),
				_('WARNING: TorrServer may overwrite this file when it restarts. Make a backup first! This file may not exist if TorrServer uses BBolt storage.'),
				null,
				'{}'
			);
		};

		o = s.option(form.Button, '_editviewed');
		o.title = _('Configuration Files');
		o.inputtitle = _('Edit viewed.json');
		o.description = _('Viewing history in JSON format. This file may not exist if TorrServer is configured to use BBolt database for viewing history (check TorrServer web UI settings). If the file does not exist, it will be created when you save.');
		o.inputstyle = 'action';
		o.onclick = function() {
			return openFileEditor(
				'viewed',
				_('Edit viewed.json'),
				_('WARNING: This file may not exist if TorrServer uses BBolt storage for viewing history. File format: JSON with viewing history data.'),
				null,
				'[]'
			);
		};

		// ==================== FIX PERMISSIONS ====================
		o = s.option(form.Button, '_fix_permissions');
		o.title = _('Security');
		o.inputtitle = _('Fix File Permissions');
		o.description = _('Applies correct permissions to known TorrServer files.') +
			_('Only files owned by') + ' <code>torrserver</code> ' + _('are modified — external files are left untouched.') + ' ' +
			_('Use this button if you edited files manually via SSH/SFTP or placed .torrent files in the auto-load directory, and the service refuses to start or read them due to permission errors.') + ' ' +
			'<strong>' + _('Scheme:') + '</strong> ' +
			'<code>config.db</code>, <code>accs.db</code> → <code>600</code> ' + _('(owner-only, contains passwords)') + '; ' +
			'<code>settings.json</code>, <code>viewed.json</code>, <code>tg.cfg</code>, <code>wip.txt</code>, <code>bip.txt</code> → <code>640</code>; ' +
			_('logs') + ' → <code>640</code>; ' +
			_('working directory') + ' → <code>750</code>.';
		o.inputstyle = 'action';
		o.onclick = function() {
			if (!confirm(_('This will set the following permissions — Working directory: 750 (owner: torrserver); config.db, accs.db, settings.json, viewed.json, tg.cfg, wip.txt, bip.txt: 600; Log files: 640. Other files in the directory will NOT be affected. Continue?'))) {
				return Promise.resolve();
			}
			return callTSFixPermissions().then(function(res) {
				if (res && res.ok) {
					ui.addNotification(null, E('p', _('Permissions fixed successfully!') + ' ' + (res.message || '')));
				} else {
					ui.addNotification(null, E('p', _('Failed to fix permissions:') + ' ' + (res && res.error ? res.error : 'unknown error')));
				}
			}).catch(function(err) {
				ui.addNotification(null, E('p', _('Fix permissions error:') + ' ' + esc(err.message)));
			});
		};

		// ==================== BACKUP / RESTORE ====================
		o = s.option(form.DummyValue, '_backup_section', _('Backup & Restore'));
		o.cfgvalue = function() {
		    return E('div', {}, [
		        E('div', { 'class': 'alert-message info', 'style': 'margin-bottom:10px;' }, [
		            E('h4', {}, [_('Configuration Backup')]),
		            E('p', {}, [_('Create a backup of TorrServer configuration files (database, settings, viewing history, IP lists) or restore from a previous backup.')]),
		            E('p', {}, [
		                E('strong', {}, [_('Files included:')]),
		                ' ',
		                E('code', {}, 'config.db, settings.json, viewed.json, accs.db, wip.txt, bip.txt, tg.cfg')
		            ])
		        ]),
		        E('div', { 'class': 'cbi-page-actions' }, [
		            E('button', {
		                'class': 'btn cbi-button-action',
		                'click': function() { openBackupDialog(); }
		            }, [_('Create Backup')]),
		            E('button', {
		                'class': 'btn cbi-button-neutral',
		                'click': function() { openRestoreDialog(); }
		            }, [_('Restore from Backup')])
		        ])
		    ]);
		};

		// ==================== LOGGING & DIAGNOSTICS ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('Logging & Diagnostics'));
		o = s.option(form.Flag, 'stdout', _('Forward stdout to syslog'));
		o.description = _('If enabled, standard output of the TorrServer process is captured by procd and forwarded to the system log. If disabled, stdout is discarded.');
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'stderr', _('Forward stderr to syslog'));
		o.description = _('If enabled, standard error of the TorrServer process is captured by procd and forwarded to the system log. If disabled, stderr is discarded.');
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Button, '_viewsyslog');
		o.title = _('System Log (syslog)');
		o.inputtitle = _('View System Log (logread)');
		o.description = _('Shows TorrServer entries from the system log (logread). Process output appears there only when at least one of the two options above is enabled (forwarding stdout/stderr to syslog). Messages from the init.d script are visible regardless of these options.');
		o.inputstyle = 'action';
		o.onclick = function() {
			openSyslogTail(_('TorrServer System Log (logread)'));
			return Promise.resolve();
		};

		o = s.option(form.Flag, 'enable_logfile', _('Write server log to a separate file'));
		o.description = _('If enabled, logs will be duplicated to the file specified below. Otherwise, they are only available via System Log (logread).');
		o.default = '0';
		o.rmempty = false;

		var oLogPath = s.option(form.Value, 'logpath', _('Server log file path'));
		oLogPath.depends('enable_logfile', '1');
		oLogPath.description = _('Absolute path to the log file. The parent directory will be created automatically with correct permissions. The file itself is created and written by TorrServer running as user') + ' <code>torrserver</code>.';
		oLogPath.validate = function(section_id, value) {
			if (value === '') return _('Path is required when file logging is enabled.');
			return validateAbsPath(section_id, value);
		};
		oLogPath.rmempty = true;

		o = s.option(form.Flag, 'enable_weblogfile', _('Write web access log to a separate file'));
		o.description = _('If enabled, web UI and API requests will be written to a separate file.');
		o.default = '0';
		o.rmempty = false;

		var oWebLogPath = s.option(form.Value, 'weblogpath', _('Web access log file path'));
		oWebLogPath.depends('enable_weblogfile', '1');
		oWebLogPath.description = _('Absolute path to the web requests log file.');
		oWebLogPath.validate = function(section_id, value) {
			if (value === '') return _('Path is required when web access logging is enabled.');
			return validateAbsPath(section_id, value);
		};
		oWebLogPath.rmempty = true;

		o = s.option(form.Button, '_viewlog');
		o.title = _('Service Logs');
		o.inputtitle = _('View Server Log (Live Tail)');
		o.description = _('Opens the log file with real-time updates (every second).');
		o.inputstyle = 'action';
		o.depends('enable_logfile', '1');
		o.onclick = function() {
			var logpath = uci.get('torrserver', 'global', 'logpath') || '';
			if (!logpath) {
				ui.addNotification(null, E('p', _('Log file path is not set.')));
				return Promise.resolve();
			}
			openLiveTail('log', _('TorrServer Server Log - Live Tail'));
			return Promise.resolve();
		};

		o = s.option(form.Button, '_viewweblog');
		o.title = _('Web Access Logs');
		o.inputtitle = _('View Web Access Log (Live Tail)');
		o.description = _('Opens the web access log with real-time updates.');
		o.inputstyle = 'action';
		o.depends('enable_weblogfile', '1');
		o.onclick = function() {
			var weblogpath = uci.get('torrserver', 'global', 'weblogpath') || '';
			if (!weblogpath) {
				ui.addNotification(null, E('p', _('Web access log path is not set.')));
				return Promise.resolve();
			}
			openLiveTail('weblog', _('TorrServer Web Access Log - Live Tail'));
			return Promise.resolve();
		};

		// ==================== NETWORK & PORTS ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('Network & Ports'));
		o = s.option(form.DynamicList, 'ip', _('Bind IP addresses'));
		o.description = _('Web server bind addresses (repeatable). Default is empty, which binds to all interfaces.');
		o.placeholder = '0.0.0.0';
		o.datatype = 'ipaddr';

		o = s.option(form.Value, 'port', _('HTTP web server port'));
		o.description = _('Port for the HTTP web server (default: 8090). This is the main port for accessing the TorrServer web interface and API when SSL is disabled.');
		o.placeholder = '8090';
		o.validate = function(section_id, value) {
			if (value === '') return true;
			var p = parseInt(value, 10);
			if (isNaN(p) || p < 1 || p > 65535) return _('Port must be between 1 and 65535');
			return true;
		};

		o = s.option(form.Flag, 'ssl', _('Enable HTTPS for web server'));
		o.description = _('Enables HTTPS for the web server. When enabled, TorrServer will listen on both HTTP and HTTPS ports simultaneously.');

		o = s.option(form.Value, 'sslport', _('HTTPS web server port'));
		o.description = _('Port for the HTTPS web server (default: 8091). If not set, will be taken from database (if stored previously) or the default will be used. Only active when HTTPS is enabled.');
		o.placeholder = '8091';
		o.validate = function(section_id, value) {
			if (value === '') return true;
			var p = parseInt(value, 10);
			if (isNaN(p) || p < 1 || p > 65535) return _('Port must be between 1 and 65535');
			return true;
		};
		o.depends('ssl', '1');

		o = s.option(form.Value, 'sslcert', _('Path to SSL certificate file'));
		o.description = _('Path to the SSL certificate file. If not set, will be taken from database (if stored previously) or a default self-signed certificate/key will be generated automatically.');
		o.validate = validateSslPath;
		o.depends('ssl', '1');

		o = s.option(form.Value, 'sslkey', _('Path to SSL key file'));
		o.description = _('Path to the SSL private key file. If not set, will be taken from database (if stored previously) or a default self-signed certificate/key will be generated automatically.');
		o.validate = validateSslPath;
		o.depends('ssl', '1');

		o = s.option(form.Flag, 'forcehttps', _('Force HTTPS'));
		o.description = _('With SSL enabled, the HTTP listener answers only with 307 Temporary Redirect to HTTPS. Requires SSL to be enabled.');
		o.depends('ssl', '1');

		o = s.option(form.Value, 'pubipv4', _('Public IPv4 address'));
		o.description = _('Set public IPv4 address for the server. Used when the server is behind NAT and needs to report its external IP address to peers.');
		o.datatype = 'ip4addr';

		o = s.option(form.Value, 'pubipv6', _('Public IPv6 address'));
		o.description = _('Set public IPv6 address for the server. Used when the server is behind NAT and needs to report its external IPv6 address to peers.');
		o.datatype = 'ip6addr';

		o = s.option(form.Value, 'proxyurl', _('Proxy URL for BitTorrent traffic'));
		o.description = _('Set proxy URL (HTTP, SOCKS4, SOCKS5, SOCKS5H). Example: socks5h://user:password@example.com:2080');
		o.validate = validateProxyUrl;

		o = s.option(form.ListValue, 'proxymode', _('Proxy mode'));
		o.description = _('Set proxy mode for BitTorrent traffic.');
		o.value('tracker', _('Tracker only (default)'));
		o.value('peers', _('Peers only'));
		o.value('full', _('Full (all traffic)'));
		o.default = 'tracker';

		// ==================== IP ACCESS CONTROL ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('IP Access Control'));
		o = s.option(form.DummyValue, '_ipcontrol_info', _('How it works'));
		o.rawhtml = true;
		o.description =
			_('Priority rules:') + ' ' +
			_('If whitelist exists, ONLY IPs in the whitelist are allowed (whitelist has priority)') + '. ' +
			_('Blacklisted IPs are blocked regardless of whitelist') + '. ' +
			_('Empty files = no restrictions') + '.';
		o.cfgvalue = function() {
			return '<div id="ts-ip-card">' +
				'<div class="ts-row"><strong>' + _('Whitelist file:') + '</strong> <code>' + esc(wipPath) + '</code></div>' +
				'<div class="ts-row"><strong>' + _('Blacklist file:') + '</strong> <code>' + esc(bipPath) + '</code></div>' +
				'</div>';
		};

		o = s.option(form.Button, '_editwhitelist_form');
		o.title = _('Whitelist (wip.txt)');
		o.inputtitle = _('Edit Whitelist (Form)');
		o.description = _('Add or remove allowed IP addresses and ranges via a convenient form.');
		o.inputstyle = 'action';
		o.onclick = function() {
			return openIpListEditor(
				'wip',
				_('Edit Whitelist (wip.txt)'),
				_('Whitelist has priority! If non-empty, only listed IPs can access TorrServer.'),
				'# Whitelist - allowed IPs\n',
				true
			);
		};

		o = s.option(form.Button, '_editwhitelist_raw');
		o.title = _('Whitelist (wip.txt)');
		o.inputtitle = _('Edit Whitelist (Raw)');
		o.description = _('Edit wip.txt as plain text. Format: <code>[description:]IP[-IP] or just IP</code>. For advanced users.');
		o.inputstyle = 'action';
		o.onclick = function() {
			return openFileEditor(
				'wip',
				_('Edit Whitelist (wip.txt)'),
				_('Whitelist has priority! If non-empty, only listed IPs can access TorrServer.'),
				validateIpRule,
				'# Whitelist - allowed IPs\n# Format: [description:]IP[-IP] or just IP\n# Examples:\n# local:192.168.1.0-192.168.1.255\n# 192.168.1.0-192.168.1.255\n# localhost:127.0.0.1\n# 127.0.0.1\n'
			);
		};

		o = s.option(form.Button, '_editblacklist_form');
		o.title = _('Blacklist (bip.txt)');
		o.inputtitle = _('Edit Blacklist (Form)');
		o.description = _('Add or remove blocked IP addresses and ranges via a convenient form.');
		o.inputstyle = 'action';
		o.onclick = function() {
			return openIpListEditor(
				'bip',
				_('Edit Blacklist (bip.txt)'),
				_('Blacklisted IPs are blocked from accessing TorrServer.'),
				'# Blacklist - blocked IPs\n',
				false
			);
		};

		o = s.option(form.Button, '_editblacklist_raw');
		o.title = _('Blacklist (bip.txt)');
		o.inputtitle = _('Edit Blacklist (Raw)');
		o.description = _('Edit bip.txt as plain text. Format: <code>[description:]IP[-IP] or just IP</code>. For advanced users.');
		o.inputstyle = 'action';
		o.onclick = function() {
			return openFileEditor(
				'bip',
				_('Edit Blacklist (bip.txt)'),
				_('Blacklisted IPs are blocked from accessing TorrServer.'),
				validateIpRule,
				'# Blacklist - blocked IPs\n# Format: [description:]IP[-IP]\n# Examples:\n# bad_range:10.0.0.0-10.0.0.255\n# 10.0.0.0-10.0.0.255\n# spammer:192.168.100.50\n# 192.168.100.50\n'
			);
		};

		// ==================== SECURITY & AUTHENTICATION ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('Security & Authentication'));
		o = s.option(form.Flag, 'httpauth', _('Enable HTTP authentication on all requests'));
		o.description = _('Enables HTTP Basic Authentication for all API requests and web interface access.') + ' ' +
			_('The credentials file is NOT created automatically anymore. Before enabling this option, create the accs.db file with at least one username/password pair using the editors below ("Edit accs.db (Form)" or "Edit accs.db (Raw)").') + ' ' +
			_('If you enable authentication without a credentials file, TorrServer will demand a login and password, but no valid credentials will exist, and access to the web interface will be impossible until you create accs.db.') + ' ' +
			_('Passwords are stored in') + ' <strong>' + _('plain text') + '</strong> ' + _('in') + ' <code>accs.db</code>. ' +
			_('The file has strict permissions (600), but anyone with root access to the router can read it. This file') + ' ' +
			'<strong>' + _('persists after package removal') + '</strong>.';

		o = s.option(form.Button, '_editaccs_form');
		o.title = _('Authentication Credentials');
		o.inputtitle = _('Edit accs.db (Form)');
		o.description = _('Add, edit, or remove user accounts for HTTP authentication via a convenient form. Format: username + password pairs.');
		o.inputstyle = 'action';
		o.depends('httpauth', '1');
		o.onclick = function() {
			return openAccsConfigEditor();
		};

		o = s.option(form.Button, '_editaccs_raw');
		o.title = _('Authentication Credentials');
		o.inputtitle = _('Edit accs.db (Raw)');
		o.description = _('Edit accs.db as plain text JSON. Format: <code>{"login":"password"}</code>. For advanced users.');
		o.inputstyle = 'action';
		o.depends('httpauth', '1');
		o.onclick = function() {
			return openFileEditor(
				'accs',
				_('Edit accs.db'),
				_('WARNING: This file stores authentication credentials in plain text JSON. Format: {"login":"password"}. Restart TorrServer after editing.'),
				null,
				'{}'
			);
		};

		o = s.option(form.Flag, 'searchwa', _('Allow search without authentication'));
		o.description = _('When enabled, allows search requests (including Torznab searches) without requiring authentication, even when HTTP authentication is enabled for other operations.');
		o.depends('httpauth', '1');

		// ==================== TELEGRAM BOT ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('Telegram Bot'));
		o = s.option(form.Flag, 'enable_telegram', _('Enable Telegram Bot'));
		o.description = _('Enable Telegram bot integration for remote control of TorrServer via Telegram.') +
			' ' + _('When disabled, the bot token is cleared and the bot will not start.');
		o.default = '0';
		o.rmempty = false;
		o.write = function(section_id, value) {
			uci.set('torrserver', section_id, 'enable_telegram', value);
			if (value === '0') {
				uci.set('torrserver', section_id, 'tgtoken', '');
			}
		};

		o = s.option(form.Value, 'tgtoken', _('Telegram bot token'));
		o.description = _('Token for Telegram bot integration (get it from') +
			' <a href="https://t.me/BotFather" target="_blank" style="color:#0088cc; text-decoration:underline;">@BotFather</a>). ' +
			'<strong>' + _('Warning: the token is visible in the process list (via') + ' <code>ps</code>' + _(') and stored in') + ' <code>/etc/config/torrserver</code>. ' +
			_('Additionally, Telegram bot settings (including WhiteIds/BlackIds) are saved to') + ' <code>tg.cfg</code> ' +
			_('in the working directory and') + ' <strong>' + _('persist after package removal') + '</strong>.' + '</strong>';
		o.rmempty = false;
		o.depends('enable_telegram', '1');
		o.validate = function(section_id, value) {
			var enabled = uci.get('torrserver', 'global', 'enable_telegram');
			if (enabled === '1' && (!value || !value.trim())) {
				return _('Telegram bot token is required when Telegram Bot is enabled.');
			}
			if (value && value.trim()) {
				var t = value.trim();
				if (!/^[0-9]+:[A-Za-z0-9_-]{20,}$/.test(t)) {
					return _('Invalid token format. Expected format: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ');
				}
			}
			return true;
		};

		o = s.option(form.Button, '_edittgconfig');
		o.title = _('Telegram Bot Configuration');
		o.inputtitle = _('Edit tg.cfg (Form)');
		o.description = _('Telegram bot settings (HostTG, HostWeb, Socks5, WhiteIds, BlackIds) via a convenient form.') +
			' ' + _('This file may not exist if Telegram bot is not configured. If the file does not exist, it will be created when you save.');
		o.inputstyle = 'action';
		o.depends('enable_telegram', '1');
		o.onclick = function() {
			return openTgConfigEditor();
		};

		o = s.option(form.Button, '_edittgraw');
		o.title = _('Telegram Bot Configuration');
		o.inputtitle = _('Edit tg.cfg (Raw)');
		o.description = _('Edit tg.cfg as plain text (JSON). For advanced users.');
		o.inputstyle = 'action';
		o.depends('enable_telegram', '1');
		o.onclick = function() {
			return openFileEditor(
				'tg',
				_('Edit tg.cfg'),
				_('WARNING: This is a JSON file. Invalid JSON will prevent the Telegram bot from starting.') +
				' ' + _('TorrServer must be restarted after editing this file.')
			);
		};

		// ==================== TORRENTS & CLIENT ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('Torrents & Client'));
		o = s.option(form.Value, 'torrentsdir', _('Auto-load torrents from directory'));
		o.description = _('Directory to automatically load .torrent files from. TorrServer will monitor this directory and automatically add new torrent files to the server.') + ' ' +
			_('TorrServer runs as user') + ' <code>torrserver</code>, ' +
			_('so any .torrent file placed here must be readable by this user. When copying files manually via SSH/SFTP, ensure at least') + ' <code>chmod 644</code> ' +
			_('permissions, or run') + ' <code>chown torrserver:torrserver &lt;file&gt;</code>. ' +
			_('Without read permissions, TorrServer will silently ignore the file.') + ' ' +
			_('Use the "Fix File Permissions" button below to automatically correct permissions for all known files.');
		o.validate = validateAbsPath;

		o = s.option(form.Value, 'torrentaddr', _('Torrent client address'));
		o.description = _('Address of external torrent client in format <code>[IP]:PORT</code> (examples: <code>:32000</code>, <code>127.0.0.1:32768</code>). Used when TorrServer needs to communicate with an external BitTorrent client.');
		o.validate = validateTorrentAddr;

		o = s.option(form.Value, 'fuse', _('FUSE mount path'));
		o.description = _('Path to mount torrents via FUSE.') +
			(!toolsAvailable.fuse ? '<div class="alert-message warning" style="margin-top:5px;">⚠ ' + _('fuse-utils package is not installed. FUSE mounting will not work.') + ' ' + _('Install via:') + ' <code>opkg install fuse-utils</code></div>' : '');
		o.validate = validateAbsPath;

		o = s.option(form.Flag, 'webdav', _('Enable WebDAV'));
		o.description = _('Enable WebDAV server for accessing torrents.');

		// ==================== BEHAVIOR & FLAGS ====================
		s = m.section(form.NamedSection, 'global', 'torrserver', _('Behavior & Flags'));
		o = s.option(form.Flag, 'respawn', _('Auto-restart on crash'));
		o.description = _('If TorrServer crashes, procd will automatically start it again. Without this, a crashed service stays stopped until you start it manually or reboot. A manual Stop is not affected — procd only respawns unexpected exits.');

		o = s.option(form.Value, 'respawn_threshold', _('Stable-run threshold (seconds)'));
		o.description = _('If the process ran longer than this before crashing, procd resets the crash counter and treats the next crash as a fresh one. Default: 3600 (one hour).');
		o.placeholder = '3600';
		o.depends('respawn', '1');
		o.validate = nonNegInt;

		o = s.option(form.Value, 'respawn_timeout', _('Delay before restart (seconds)'));
		o.description = _('How long procd waits after a crash before starting TorrServer again. Default: 5.');
		o.placeholder = '5';
		o.depends('respawn', '1');
		o.validate = nonNegInt;

		o = s.option(form.Value, 'respawn_retry', _('Max fast-crash retries (0 = unlimited)'));
		o.description = _('How many consecutive fast crashes (within the stable-run threshold) procd tolerates before giving up. 0 = keep trying forever. Default: 3.');
		o.placeholder = '3';
		o.depends('respawn', '1');
		o.validate = nonNegInt;

		o = s.option(form.Value, 'maxsize', _('Max allowed stream size (Bytes)'));
		o.description = _('Maximum allowed stream size in bytes.');
		o.validate = nonNegInt;

		o = s.option(form.Value, 'term_timeout', _('Graceful shutdown timeout (seconds)'));
		o.description = _('Time in seconds given to TorrServer to shut down gracefully after receiving SIGTERM. If the process does not exit within this period, procd sends SIGKILL. Leave the field empty to use the init.d built-in default of 15 seconds (the option will then be removed from the UCI config). Setting 0 means immediate SIGKILL — the process will have no time to save data.');
		o.placeholder = '15';
		o.rmempty = true;
		o.validate = nonNegInt;

		o = s.option(form.Flag, 'dontkill', _('Do not kill server on signal'));
		o.description = _('Makes TorrServer ignore stop signals (SIGTERM, SIGINT, SIGHUP, SIGQUIT). <strong>Not recommended under procd:</strong> the Stop/Restart buttons and clean shutdown on reboot will stop working, because procd manages the service via SIGTERM. The server could then only be stopped through its own web UI or with <code>kill -9</code>. Intended for manually started instances.');

		injectStyle();
		var self = this;
		return m.render().then(function(el) {
			var btnStart   = el.querySelector('#cbid\\.torrserver\\.global\\._btn_start');
			var btnRestart = el.querySelector('#cbid\\.torrserver\\.global\\._btn_restart');
			var btnStop    = el.querySelector('#cbid\\.torrserver\\.global\\._btn_stop');
			var btnAutoEn  = el.querySelector('#cbid\\.torrserver\\.global\\._btn_autostart_enable');
			var btnAutoDis = el.querySelector('#cbid\\.torrserver\\.global\\._btn_autostart_disable');

			if (btnStart)   { var r = btnStart.closest('.cbi-value');   if (r) r.style.display = isRunning ? 'none' : ''; }
			if (btnRestart) { var r = btnRestart.closest('.cbi-value'); if (r) r.style.display = isRunning ? '' : 'none'; }
			if (btnStop)    { var r = btnStop.closest('.cbi-value');    if (r) r.style.display = isRunning ? '' : 'none'; }
			if (btnAutoEn)  { var r = btnAutoEn.closest('.cbi-value');  if (r) r.style.display = isAutostart ? 'none' : ''; }
			if (btnAutoDis) { var r = btnAutoDis.closest('.cbi-value'); if (r) r.style.display = isAutostart ? '' : 'none'; }

			// Мгновенный первый запрос API-данных (так как в load() мы их больше не ждем)
			updateStatusCard();
			updateDiskCard();

			// Остановка опроса при уходе со страницы
			self._visibilityHandler = function() {
				if (document.hidden) {
					_pollsActive = false;
				} else {
					_pollsActive = true;
					updateStatusCard();
					updateDiskCard();
				}
			};
			document.addEventListener('visibilitychange', self._visibilityHandler);

			// LuCI сам очистит эти poll-задачи при уходе со страницы (деструкторе view)
			poll.add(function() { return updateStatusCard(); }, 1);
			poll.add(function() { return updateDiskCard(); }, 1);

			el.addEventListener('click', handleServiceClick);
			return el;
	});
	},

	remove: function() {
		// Останавливаем polling
		_pollsActive = false;
		_statusFetching = false;
		_diskFetching = false;

		// Снимаем visibilitychange listener
		if (this._visibilityHandler) {
			document.removeEventListener('visibilitychange', this._visibilityHandler);
			this._visibilityHandler = null;
		}
	}
});
