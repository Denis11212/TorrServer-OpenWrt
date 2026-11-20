# Что это вообще такое?

Проект ставит единственную задачу: **максимально упростить установку TorrServer на устройства с операционной системой OpenWrt**, при этом полностью соблюдая философию OpenWrt. Разумеется, я знаю, что на роутерах каждый килобайт важен, а потому стараюсь всеми известными мне способами облегчить пакет без потери функциональности и без рисков некрректной работы. Проект учебный, но свою функцию на данный моменет выполняет.

Сам TorrServer и его исходный код лежит по адресу: [github.com/YouROK/TorrServer](https://github.com/YouROK/TorrServer), а разработкой занимается [YouROK](https://yourok.ru/). Этот же проект — **не более чем попытка** перенести TorrServer на ОС OpenWrt и для удобного управления из LuCI.

# Цели проекта

В первую очередь проект преследует следующие цели:

- **Полноценная поддержка UCI-интерфейса.** Если не использовать LuCI, UCI-файлы обеспечат взаимодействие с сервисом на том уровне, на котором они могут это обеспечить. Разумеется, никакого анализа логов или интерактивного выбора тут сделать невозможно, но вот управление директориями работы, путями к файлам и параметрами запуска — пожалуйста.

- **Полноценная поддержка LuCI.** Официальный веб-интерфейс OpenWrt позволяет читать логи в реальном времени, просматривать версию и статус работы сервиса, изменять флаги запуска, анализировать занимаемое дисковое пространство, удобно редактировать `settings.json`, получать быстрый доступ к основному веб-интерфейсу TorrServer и многое другое.

- **Лёгкая установка, но по философии OpenWrt.** Для того чтобы начать пользоваться, достаточно лишь поставить пакеты для нужных компонентов. Можно установить исключительно `torrserver` и управлять им только через UCI, можно добавить пакет для управления через LuCI, а можно ещё отдельно поставить пакет с переводом на русский язык.

- **Экономия места.** Для устройств с малым объёмом памяти доступна UPX-версия бинарника — пережатая утилитой UPX для минимизации занимаемого места.
- **Полная поддержка тем**. Любые темы, которые написаны по стандартам OpenWrt будут корректно менять все возможные элементы интерфейса.

# Скриншоты

<img width="1108" height="1185" alt="Снимок экрана 2026-11-20 174103" src="https://github.com/user-attachments/assets/3df82f3e-e337-40dd-83ae-2e4547e8c1bf" /><img width="1092" height="1240" alt="Снимок экрана 2026-11-20 173935" src="https://github.com/user-attachments/assets/383f16f9-36fe-4d2f-8ef4-81bddce8811a" />
<img width="1093" height="1243" alt="Снимок экрана 2026-11-20 173855" src="https://github.com/user-attachments/assets/d502d578-69ca-4dfd-a7fe-5aedc1e2b74e" />
<img width="1084" height="1121" alt="Снимок экрана 2026-11-20 173801" src="https://github.com/user-attachments/assets/8edeeaf9-4d89-45b5-80c3-278f878b430e" />
<img width="1094" height="1132" alt="Снимок экрана 2026-11-20 173720" src="https://github.com/user-attachments/assets/abed2e1c-60a7-44a6-af86-8b9f9c8ed565" />



# Планы на будущее

- Довести код и стабильность работы до такого состояния, чтобы не стыдно было отправить пакет в официальный репозиторий OpenWrt (feeds/packages).

# Почему много ошибок в коде и что это вообще

Во-первых, я буду очень рад, если мне будут указывать на конкретные ошибки, недоработки и рассказывать, как их исправить, почему так делать не следует и так далее.

У меня нет профильного образования, и раньше программированием я толком не занимался. Цель создания данного проекта — по чуть-чуть осваивать это ремесло, когда есть время и возможность. Впрочем, проект работает, и, на мой взгляд, работает неплохо.

**Если видите баг или знаете, как сделать лучше — пожалуйста, [откройте Issue](https://github.com/Denis11212/TorrServer-OpenWrt/issues/new/choose) или [Pull Request](https://github.com/Denis11212/TorrServer-OpenWrt/pulls). Буду очень благодарен за любую обратную связь.**

Приятного тестирования и пользования!

# Установка

скачать из Release apk или ipk файлы в зависимости от вашей системы и установить их последовательно: сначала сам сервис torrserver, затем luci части, а затем уже перевод i18n.

например, так
```bash
apk add --allow-untrusted torrserver-upx_145.2-r1_aarch64_cortex-a53.apk
apk add --allow-untrusted luci-app-torrserver_1.0-r1_all.apk
apk add --allow-untrusted luci-i18n-torrserver-ru_0_all.apk
```
или так
```bash
opkg install torrserver-upx_145.2-r1_aarch64_cortex-a53.ipk
opkg install luci-app-torrserver_1.0-r1_all.ipk
opkg install luci-i18n-torrserver-ru_0_all.ipk
```

# Работа с Actions
  
### Получение sha256 (для PKG_HASH при смене версии)
Windows (cmd):
```bat
curl -sL https://github.com/YouROK/TorrServer/archive/refs/tags/MatriX.150.tar.gz -o source.tar.gz
certutil -hashfile source.tar.gz SHA256
```
Linux / Git Bash:
```bash
curl -sL https://github.com/YouROK/TorrServer/archive/refs/tags/MatriX.150.tar.gz | sha256sum
```

### Создание тега на примере версии MatriX.150
Откройте GitHub Desktop → нужный репозиторий → меню **Repository → Open in Command Prompt**:
```bat
git checkout main
git pull
git tag -a MatriX.150 -m "TorrServer MatriX.150"
git push origin MatriX.150
git ls-remote --tags origin
```
Передвинуть тег после изменения, если вдруг релиз вышел бракованный после сборки и его пришлось исправлять (не забыть перед этим удалить предыдущий релиз), а затем чтобы собрать заново нужно сделать так:
```
git tag -f MatriX.150 && git push -f origin MatriX.150
```

### Запуск, если Actions отключен

Путеводитель по ручному запуску 

| Поле | Что это | По умолчанию | Если пусто |
|---|---|---|---|
| **Use workflow from** | Из какой ветки/тега брать сам workflow **и весь код** (Makefile, files/, luci-app) | текущая ветка | нельзя пусто — всегда что-то выбрано |
| **openwrt_version** \* | Под какую версию OpenWrt собирать → определяет **формат пакетов** | `both` | обязательное поле, пусто нельзя |
| **targets** | Какие архитектуры собирать | `all` | = все архитектуры |
| **torrserver_tag** | Какой тег апстрима качать → `TS_TAG` | `latest` | на теге → имя тега репозитория; на ветке → `TS_TAG_DEF` из Makefile |
| **pkg_version** | Версия пакета → `PKG_VERSION`, попадает в имя файла | пусто | вычисляется из тега |
| **pkg_release** | Ревизия упаковки → `PKG_RELEASE`, суффикс `-rN` | пусто | `PKG_RELEASE_DEF` из Makefile (= `1`) |
| **build_luci** | Собирать ли `luci-app-torrserver` + i18n | ✅ `true` |  |
| **skip_release** | Не публиковать релиз даже при запуске с тега | ☐ `false` | = публиковать (если ref — тег) |

### torrserver_tag

| Значение | Поведение |
|---|---|
| `latest` / `latest-matrix` | авто-поиск новейшего `MatriX.*` через `git ls-remote \| sort -V` |
| `latest-silo` | то же для `Silo.*` (экспериментальная ветка, не соберётся) |
| `MatriX.150`, `1.1.77` | конкретный тег как есть (регистр важен) |
| пусто | тег репозитория или `TS_TAG_DEF` из Makefile |

### pkg_version

Авто-вывод из тега: `MatriX.150` → `150`, `MatriX.147.2` → `147.2`, `Silo.2` → `200.2`, `1.1.77` → `1.1.77`. Только цифры и точки (требование apk). Вручную — когда нужно форсировать версию, например `150.1` для пересборки того же тега как обновления.

### pkg_release

Инкрементировать при правках упаковки (init, конфиг, флаги) без смены версии апстрима; сбрасывать в `1` при новом теге. Видно в именах: `torrserver_150-r1_x86_64.ipk`, `torrserver-150-r1.apk`.

```text
torrserver_150-r1_x86_64.ipk
             │   │
             │   └─ PKG_RELEASE (ревизия упаковки)
             └───── PKG_VERSION (версия пакета)
```

0. Если висит «workflow was disabled», нажмите **Enable workflow**.
1. Перейти в раздел Actions репозитория
2. Выбрать Workflow под названием Build packages
3. Нажать Run Worflow
4. В Use workflow from выбрать Tags и нужный тег
5. Осталось ввести версию OpenWrt и запустить сборку.

# Правильная структура пакетов

```text
openwrt-torrserver/
├── .github/
│   └── workflows/
│       └── build.yml
├── .gitignore
├── LICENSE
├── README.md
├── torrserver/
│   ├── Makefile
│   └── files/
│       ├── torrserver.init
│       └── torrserver.config
└── luci-app-torrserver/
    ├── Makefile
    ├── htdocs/
    │   └── luci-static/
    │       └── resources/
    │           └── view/
    │               └── torrserver.js
    ├── root/
    │   └── usr/
    │       └── share/
    │           ├── luci/
    │           │   └── menu.d/
    │           │       └── luci-app-torrserver.json
    │           └── rpcd/
    │               └── acl.d/
    │                   └── luci-app-torrserver.json
    └── po/
        └── ru/
            └── torrserver.po
```

## Структура пакетов после установки на OpenWrt
Могут быть ошибки, если будут изменения в коде или установочных скриптах openwrt. Да и к тому же, на самом деле файлов больше, включая те же скрипты ostrm postinst и т.д. Включая созданные папки программой, включая созданных пользователей, и т.д.
```text
/
├── etc/
│   ├── config/
│   │   └── torrserver                    ← UCI-конфигурация (из files/torrserver.config)
│   └── init.d/
│       └── torrserver                    ← init-скрипт (из files/torrserver.init)
│
├── usr/
│   ├── bin/
│   │   └── torrserver                    ← бинарник сервера (скачивается/собирается Makefile-ом)
│   ├── lib/
│   │   └── lua/
│   │       └── luci/
│   │           └── i18n/
│   │               └── torrserver.ru.lmo ← скомпилированный перевод (из po/ru/torrserver.po)
│   └── share/
│       ├── luci/
│       │   └── menu.d/
│       │       └── luci-app-torrserver.json  ← описание пункта меню LuCI
│       └── rpcd/
│           └── acl.d/
│               └── luci-app-torrserver.json  ← ACL для ubus-вызовов
│
└── www/
    └── luci-static/
        └── resources/
            └── view/
                └── torrserver.js         ← клиентский JS-код LuCI-приложения
```
Например, вот какие ещё файлы есть после установки (хотя среди них могут быть останки от разработки):

```
root@OpenWrt:~# find / -name *torrserver*
/etc/config/torrserver
/etc/init.d/torrserver
/etc/rc.d/S99torrserver
/etc/rc.d/K10torrserver
/overlay/upper/usr/share/luci/menu.d/luci-app-torrserver.json
/overlay/upper/usr/share/rpcd/acl.d/luci-app-torrserver.json
/overlay/upper/usr/libexec/rpcd/torrserver
/overlay/upper/usr/lib/lua/luci/i18n/torrserver.ru.lmo
/overlay/upper/usr/lib/opkg/info/luci-i18n-torrserver-ru.postinst
/overlay/upper/usr/lib/opkg/info/torrserver.postrm
/overlay/upper/usr/lib/opkg/info/luci-i18n-torrserver-ru.prerm
/overlay/upper/usr/lib/opkg/info/luci-app-torrserver.control
/overlay/upper/usr/lib/opkg/info/torrserver.postinst
/overlay/upper/usr/lib/opkg/info/torrserver.list
/overlay/upper/usr/lib/opkg/info/luci-app-torrserver.list
/overlay/upper/usr/lib/opkg/info/luci-app-torrserver.prerm
/overlay/upper/usr/lib/opkg/info/torrserver.prerm
/overlay/upper/usr/lib/opkg/info/torrserver.control
/overlay/upper/usr/lib/opkg/info/luci-i18n-torrserver-ru.list
/overlay/upper/usr/lib/opkg/info/luci-i18n-torrserver-ru.control
/overlay/upper/usr/lib/opkg/info/luci-app-torrserver.postinst
/overlay/upper/usr/bin/torrserver
/overlay/upper/www/luci-static/resources/view/torrserver  ← это папка
/overlay/upper/www/luci-static/resources/view/torrserver.js
/overlay/upper/etc/config/torrserver
/overlay/upper/etc/init.d/torrserver
/overlay/upper/etc/rc.d/S99torrserver
/overlay/upper/etc/rc.d/K10torrserver
/sys/fs/cgroup/services/torrserver
/tmp/etc/torrserver  ← это временно созданная папка сервисом при начальных настройках
/tmp/lock/procd_torrserver.lock
/usr/bin/torrserver
/usr/lib/lua/luci/i18n/torrserver.ru.lmo
/usr/lib/opkg/info/luci-i18n-torrserver-ru.postinst
/usr/lib/opkg/info/torrserver.postrm
/usr/lib/opkg/info/luci-i18n-torrserver-ru.prerm
/usr/lib/opkg/info/luci-app-torrserver.control
/usr/lib/opkg/info/torrserver.postinst
/usr/lib/opkg/info/torrserver.list
/usr/lib/opkg/info/luci-app-torrserver.list
/usr/lib/opkg/info/luci-app-torrserver.prerm
/usr/lib/opkg/info/torrserver.prerm
/usr/lib/opkg/info/torrserver.control
/usr/lib/opkg/info/luci-i18n-torrserver-ru.list
/usr/lib/opkg/info/luci-i18n-torrserver-ru.control
/usr/lib/opkg/info/luci-app-torrserver.postinst
/usr/libexec/rpcd/torrserver
/usr/share/luci/menu.d/luci-app-torrserver.json
/usr/share/rpcd/acl.d/luci-app-torrserver.json
/www/luci-static/resources/view/torrserver  ← это папка
/www/luci-static/resources/view/torrserver.js
/var/etc/torrserver  ← добавил вручную, появляется как папка выполнения сервиса временно созданная папка при начальных настройках
```

## Упрощённо только файлы касемо файлов

```text
package/torrserver/
├── Makefile
└── files/
    ├── torrserver.init
    └── torrserver.config

package/luci-app-torrserver/
├── Makefile
├── htdocs/
│   └── luci-static/
│       └── resources/
│           └── view/
│               └── torrserver.js
├── root/
│   └── usr/
│       └── share/
│           ├── luci/
│           │   └── menu.d/
│           │       └── luci-app-torrserver.json
│           └── rpcd/
│               └── acl.d/
│                   └── luci-app-torrserver.json
└── po/
    └── ru/
        └── torrserver.po
```

# Полезная информацию по выделению кнопок в LuCI

| Класс | Цвет | Назначение |
|---|---|---|
| `cbi-button-action` | Синий | Основное действие |
| `cbi-button-neutral` | Серый | Нейтральное / второстепенное |
| `cbi-button-reset` | Красный | Опасное действие (удаление) |
| `cbi-button-apply` | Зелёный | Сохранить / применить |

# Полезная информацию по стандартным стилям LuCI

Соответствия стилей надписей и других сообщений

| Стандартный класс LuCI | Назначение |
| :--- | :--- |
| `.cbi-section` или `.alert-message` | Контейнеры, карточки |
| `.alert-message.info` | Информационные блоки |
| `.alert-message.warning` | Предупреждения |
| `.alert-message.error` | Ошибки, остановки |
| `.alert-message.success` | Успех, работающий сервис |
| `<code>` (без стилей) | Моноширинный текст |
| `.cbi-page-actions` или `.left`/`.right` | Группы кнопок |
| `.cbi-value-description` | Вторичный текст |


# Информацию по переводу и эмодзи в LuCI

`'<strong>📊 ' + _('BitTorrent Stats') + '</strong>'` в таком случае нужно внимательно отнестись к PO файлу. В нём не должно быть эмодзи. А если задано как `'<strong>' + _('📊 BitTorrent Stats') + '</strong>'`, то эмодзи уже должно быть в PO файле перевода.

# Отличие уже собранной версии от версии, которая собиется сама. Короткий ответ нейросети, но позже нужно будет самому всё перепроверить, хотя выглядит правдоподобно и думаю так и есть

Для Go-бинарника **разницы в производительности между подресхитектурами не будет**. Бинарник, собранный вами через OpenWrt, будет практически идентичен тому, что собирает автор.

---

### 1. Как Go компилирует под arm64

Go **не использует** флаги `-mcpu=cortex-a53`, `-mcpu=cortex-a72`, `-march=armv8.2-a` и подобные.

Когда вы собираете Go-программу:

```bash
GOOS=linux GOARCH=arm64 go build
```

Go компилирует для **базовой архитектуры armv8-a**. Точка.

Нет переменной `GOARM64` (в отличие от `GOARM` для 32-битного ARM). Go всегда целится в armv8-a baseline.

Это значит, что бинарник, собранный для `aarch64_generic`, `aarch64_cortex-a53`, `aarch64_cortex-a72`, `aarch64_cortex-a76` — **один и тот же бинарник**.

---

### 2. Почему OpenWrt разделяет подресхитектуры

OpenWrt разделяет:

```text
aarch64_generic
aarch64_cortex-a53
aarch64_cortex-a72
aarch64_cortex-a76
aarch64_armv8-a
```

Это нужно для **C/C++ пакетов** и **ядра Linux**, где компилятор использует:

```bash
gcc -mcpu=cortex-a53 -O2 ...
gcc -mcpu=cortex-a72 -O2 ...
```

Такой код может использовать специфичные инструкции:

- Cortex-A53: базовый NEON, без LSE atomics
- Cortex-A72: NEON + CRC32
- Cortex-A76: NEON + CRC32 + LSE atomics + dotprod

Для C/C++ это даёт реальный прирост производительности.

Для Go — **нет**, потому что Go compiler не принимает `-mcpu`.

---

### 3. Что Go делает для оптимизации

Go использует **runtime detection** CPU features.

Например, в стандартной библиотеке:

```go
// crypto/aes
if cpu.ARM64.HasAES {
    // используем AES hardware instructions
} else {
    // программная реализация
}

// crypto/sha256
if cpu.ARM64.HasSHA2 {
    // используем SHA2 hardware instructions
} else {
    // программная реализация
}
```

Это значит, что **один и тот же бинарник** автоматически использует:

- AES-NI / AES hardware на Cortex-A72, A76
- SHA2 hardware на Cortex-A76
- NEON на всех armv8-a CPU
- LSE atomics, если доступны

Независимо от того, для какой подресхитектуры OpenWrt собрал ipk.

---

### 4. Практические различия в бинарнике

| Параметр | Бинарник автора | Бинарник через OpenWrt |
|---|---|---|
| Архитектура | armv8-a baseline | armv8-a baseline |
| CPU-специфичные оптимизации | runtime detection | runtime detection |
| Версия Go | например, Go 1.23.x | например, Go 1.22.x (из OpenWrt 24.10) |
| Флаги линковки | может быть без `-s -w` | `-s -w` (strip + no DWARF) |
| `-trimpath` | может не быть | есть |
| Размер | ~56-60 МБ | ~40-50 МБ (за счёт `-s -w`) |
| Производительность | одинаковая | одинаковая |

Единственное реальное различие — **размер**. OpenWrt добавляет `-ldflags="-s -w"`, что убирает debug-информацию и таблицу символов. Бинарник автора может содержать эту информацию, если он не делает strip.

---

### 5. Проверка: бинарники идентичны

Можете проверить сами. Скачайте бинарник автора и соберите через OpenWrt:

```bash
# Бинарник автора
file TorrServer-linux-arm64
# ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV),
# statically linked, stripped

# Бинарник из OpenWrt
file build_dir/target-aarch64_cortex-a53_musl/torrserver-*/torrserver
# ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV),
# statically linked, stripped
```

Оба `statically linked`, оба `ARM aarch64`, оба без CPU-специфичных расширений.

Если сравнить дизассемблер:

```bash
aarch64-openwrt-linux-musl-objdump -d TorrServer-linux-arm64 | head -50
aarch64-openwrt-linux-musl-objdump -d build_dir/.../torrserver | head -50
```

Инструкции будут одинаковыми. Оба бинарника используют базовый набор инструкций armv8-a.

---

### 6. Что насчёт CGO?

Если бы TorrServer использовал CGO (например, для `libtorrent-rasterbar` или `sqlite3`), тогда C-код компилировался бы с `-mcpu=cortex-a53` для `aarch64_cortex-a53`, и была бы разница в производительности.

Но TorrServer **не использует CGO**:

```bash
# Проверка
CGO_ENABLED=0 go build -o /dev/null .
# Собирается без ошибок → CGO не нужен
```

Все зависимости TorrServer — чистый Go:

- `anacrolix/torrent` — чистый Go
- `bbolt` — чистый Go
- `gin` — чистый Go

---

### 7. Почему OpenWrt всё равно создаёт отдельные ipk

Даже если бинарник одинаковый, OpenWrt создаёт отдельные ipk для каждой подресхитектуры:

```text
torrserver_1.0.0-1_aarch64_generic.ipk
torrserver_1.0.0-1_aarch64_cortex-a53.ipk
torrserver_1.0.0-1_aarch64_cortex-a72.ipk
```

Это происходит потому, что build system OpenWrt не знает, что пакет использует Go. Он видит `DEPENDS:=$(GO_ARCH_DEPENDS)` и создаёт ipk для каждой подресхитектуры target.

Содержимое этих ipk **идентично** (один и тот же бинарник), но метаданные (имя файла, архитектура в control) различаются.

Для официального репозитория это нормально. Buildbot OpenWrt делает то же самое для всех Go-пакетов: `frp`, `syncthing`, `caddy`, `restic`.

---

### 8. Можно ли собрать один ipk для всех arm64?

Теоретически, можно установить:

```makefile
PKGARCH:=all
```

Но это **неправильно** для бинарного пакета. `PKGARCH:=all` предназначен для пакетов без бинарников (скрипты, конфиги, документация).

Для бинарного пакета нужно указывать реальную архитектуру. Даже если бинарник одинаковый для всех arm64, ipk должен быть привязан к конкретной архитектуре, чтобы opkg мог проверить совместимость.

---

### 9. Вывод

| Вопрос | Ответ |
|---|---|
| Будет ли мой бинарник быстрее? | Нет, производительность одинаковая |
| Будет ли мой бинарник медленнее? | Нет |
| Есть ли CPU-специфичные оптимизации? | Нет, Go использует runtime detection |
| Есть ли разница между aarch64_cortex-a53 и aarch64_generic? | Для Go — нет, бинарник идентичен |
| Есть ли разница в размере? | Да, OpenWrt добавляет `-s -w`, бинарник меньше |
| Нужно ли собирать под каждую подресхитектуру? | OpenWrt делает это автоматически, но содержимое одинаковое |
| Можно ли вынести библиотеки в зависимости? | Нет, Go-бинарник статический |

Для Go-приложений разделение по подресхитектурам — это формальность build system OpenWrt. Реальной разницы в бинарнике нет.

# Насчёт перехода на сборку из полных исходников OpenWrt, чтобы быть ещё ближе к интеграции в официальный репозиторий.
## Сравнение: Вариант 1 (текущий) против Варианта 2 (из исходников)

| Критерий | Вариант 1 (текущий) | Вариант 2 (из исходников) |
|----------|---------------------|---------------------------|
| **Время сборки** | ~15-30 мин на архитектуру | 2-6 часов (все вместе) |
| **Ресурсы** | 5-10 ГБ | 50+ ГБ |
| **Гибкость** | Низкая | Высокая |
| **Сборка ядра** | ❌ Нет | ✅ Да |
| **Сборка пакетов** | ✅ Да | ✅ Да |
| **Кэширование** | Простое | Сложное, но эффективное |
| **Лимиты** | Вписывается | Может превысить |

## Когда использовать Вариант 2 на GitHub Actions

### ✅ Подходит, если:
- Нужна **полная система** (ядро + все пакеты)
- Хочешь собирать **образы прошивки**
- Нужна **стабильная версия** (например, для релизов)
- Есть **большие ресурсы** (или платный тариф)

### ❌ Не подходит, если:
- Нужны **только .ipk файлы** (как сейчас)
- Важна **скорость** сборки
- Ограничены **ресурсы**

## Плюсы Варианта 2 на GitHub Actions

### ✅ Преимущества:
1. **Полный контроль** над процессом
2. **Можно кэшировать** всё дерево сборки
3. **Стабильная версия** (фиксируешь конкретный релиз)
4. **Гибкость** — можно менять всё что угодно
5. **Образы прошивки** — можно собирать `.bin` файлы

### ❌ Недостатки:
1. **Долгая первая сборка** (2-4 часа)
2. **Большое потребление ресурсов** (50+ ГБ)
3. **Может превысить лимиты** бесплатного тарифа
4. **Сложнее в настройке**
