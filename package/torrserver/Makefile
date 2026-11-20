include $(TOPDIR)/rules.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-values.mk

PKG_NAME:=torrserver

TS_TAG_DEF:=MatriX.150
PKG_VERSION_DEF:=150
PKG_RELEASE_DEF:=1

TS_TAG:=$(or $(TS_VERSION_TAG),$(TS_TAG_DEF))
PKG_VERSION:=$(or $(TS_PKG_VERSION),$(PKG_VERSION_DEF))
PKG_RELEASE:=$(or $(TS_PKG_RELEASE),$(PKG_RELEASE_DEF))
TS_HASH ?= skip

PKG_SOURCE:=$(TS_TAG).tar.gz
PKG_SOURCE_URL:=https://github.com/YouROK/TorrServer/archive/refs/tags/
PKG_HASH:=$(TS_HASH)

PKG_LICENSE:=GPL-3.0-only
PKG_LICENSE_FILES:=LICENSE
# Я тут поставил свой ник, однако, разумеется за разработку конкретно самого TorrServer полностью отвечает YouROK, а это лишь удобная установка сервиса на OpenWrt.
PKG_MAINTAINER:=Denis11212

PKG_BUILD_DIR:=$(BUILD_DIR)/TorrServer-$(TS_TAG)

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

include $(INCLUDE_DIR)/package.mk

define Package/torrserver/Default
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=BitTorrent
  TITLE:=TorrServer - torrent stream server
  URL:=https://github.com/YouROK/TorrServer
  DEPENDS:=$(GO_ARCH_DEPENDS)
  USERID:=torrserver=65001:torrserver=65001
endef

define Package/torrserver
$(call Package/torrserver/Default)
  TITLE+= (Default version)
endef

define Package/torrserver/description
  TorrServer - torrent stream server для OpenWrt. This version is NOT compressed with UPX. It is recommended for routers with a sufficient amount of flash memory.
endef

define Package/torrserver-upx
$(call Package/torrserver/Default)
  TITLE+= (Compressed UPX)
  CONFLICTS:=torrserver
  PROVIDES:=torrserver
endef

define Package/torrserver-upx/description
  TorrServer - torrent stream server для OpenWrt. This version is COMPRESSED UPX, which saves NAND/flash memory space (~60% less). When launched, it is unpacked into RAM, requiring more RAM.
endef

define Package/torrserver/conffiles
/etc/config/torrserver
endef

define Package/torrserver-upx/conffiles
/etc/config/torrserver
endef

MIPS_CONFLICT_FLAGS:= -mips32 -mips32r2 -mips32r3 -mips32r5 -mips32r6 -mips64 -mips64r2 -mips64r3 -mips64r5 -mips64r6 -march=mips32 -march=mips32r2 -march=mips64

FILTERED_CFLAGS:=$(filter-out $(MIPS_CONFLICT_FLAGS),$(TARGET_CFLAGS))
FILTERED_LDFLAGS:=$(filter-out $(MIPS_CONFLICT_FLAGS),$(TARGET_LDFLAGS))

ifneq ($(findstring mips,$(ARCH)),)
  CGO_ENABLED_VAL:=0
else
  CGO_ENABLED_VAL:=1
endif

# Компиляция бинарного файла TorrServer
define Build/Compile
	( cd $(PKG_BUILD_DIR)/server || exit 1; \
	  export PATH="$(STAGING_DIR_HOSTPKG)/bin:$(PATH)"; \
	  export GOTOOLCHAIN=auto GOPROXY=https://proxy.golang.org,direct; \
	  go mod download || { sleep 5; go mod download; } || { sleep 10; go mod download; } || exit 1; \
	  go run github.com/swaggo/swag/cmd/swag@v1.16.6 init -g web/server.go --parseInternal --parseDepth 5 \
	)

	# 2. Кросс-компилируем бинарник
	( cd $(PKG_BUILD_DIR)/server && \
	GOOS=$(GO_OS) \
	GOARCH=$(GO_ARCH) \
	GO386="$(GO_386)" \
	GOAMD64="$(GO_AMD64)" \
	GOARM="$(GO_ARM)" \
	GOARM64="$(GO_ARM64)" \
	GOMIPS="$(GO_MIPS)" \
	GOMIPS64="$(GO_MIPS64)" \
	CGO_ENABLED=$(CGO_ENABLED_VAL) \
	CC="$(TARGET_CC)" \
	CXX="$(TARGET_CXX)" \
	CGO_CFLAGS="$(FILTERED_CFLAGS)" \
	CGO_CPPFLAGS="$(TARGET_CPPFLAGS)" \
	CGO_LDFLAGS="$(FILTERED_LDFLAGS)" \
	GOTOOLCHAIN=auto \
	go build -v -trimpath \
	-ldflags "-s -w -checklinkname=0 -X server/version.Version=$(TS_TAG)" \
	-tags "nosqlite" \
	-o $(PKG_BUILD_DIR)/torrserver \
	./cmd \
	)

	# 3. Дополнительная зачистка ELF-заголовков
	$(TARGET_CROSS)strip -s $(PKG_BUILD_DIR)/torrserver

	# 4. Создаем UPX-версию: копия + сжатие. На архитектурах, которые upx не поддерживает, останется несжатая копия.
	cp -f $(PKG_BUILD_DIR)/torrserver $(PKG_BUILD_DIR)/torrserver-upx
	upx --best --lzma $(PKG_BUILD_DIR)/torrserver-upx || \
	echo "WARNING: UPX compression failed or not supported for $(ARCH)"
endef

define Package/torrserver/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/torrserver $(1)/usr/bin/torrserver
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/torrserver.init $(1)/etc/init.d/torrserver
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/torrserver.config $(1)/etc/config/torrserver
endef

define Package/torrserver-upx/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/torrserver-upx $(1)/usr/bin/torrserver
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/torrserver.init $(1)/etc/init.d/torrserver
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/torrserver.config $(1)/etc/config/torrserver
endef

define Package/torrserver/postinst
#!/bin/sh
. /lib/functions.sh

TS_USER="torrserver"
TS_GROUP="torrserver"
# /var — tmpfs (RAM): осознанный выбор, чтобы беречь flash роутера. Данные здесь живут до перезагрузки; постоянный путь задаётся в UCI.
TS_PATH_DEF="/var/etc/torrserver"
TS_PATH=""

if [ -f /etc/config/torrserver ]; then
	config_load torrserver
	config_get TS_PATH global path "$$TS_PATH_DEF"
fi

TS_PATH="$${TS_PATH%/}"
[ -z "$$TS_PATH" ] && TS_PATH="$$TS_PATH_DEF"

[ ! -d "$$TS_PATH" ] && mkdir -p "$$TS_PATH"
chown "$$TS_USER:$$TS_GROUP" "$$TS_PATH"
chmod 750 "$$TS_PATH"

# Включаем и запускаем сервис (пропускаем при сборке образа)
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/torrserver enable >/dev/null 2>&1
	/etc/init.d/torrserver start >/dev/null 2>&1
}

exit 0
endef

define Package/torrserver-upx/postinst
$(call Package/torrserver/postinst)
endef

define Package/torrserver/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
/etc/init.d/torrserver stop >/dev/null 2>&1
/etc/init.d/torrserver disable >/dev/null 2>&1
exit 0
endef

define Package/torrserver-upx/prerm
$(call Package/torrserver/prerm)
endef

$(eval $(call BuildPackage,torrserver))
$(eval $(call BuildPackage,torrserver-upx))
