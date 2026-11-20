include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-torrserver
PKG_VERSION:=1.0
PKG_RELEASE:=1

PKG_LICENSE:=GPL-3.0-only
PKG_MAINTAINER:=Denis11212

LUCI_TITLE:=LuCI support for TorrServer
LUCI_DEPENDS:=+torrserver
LUCI_PKGARCH:=all
LUCI_MAINTAINER:=Denis11212

include $(TOPDIR)/feeds/luci/luci.mk

# НЕ УДАЛЯТЬ эту строку ниже! Сканер каталога package/ находит пакеты по тексту "call BuildPackage" в Makefile. luci.mk вызывает BuildPackage сам, поэтому строка закомментирована, но текст обязан присутствовать — иначе пакет не попадёт в tmp/.packageinfo и таргет package/luci-app-torrserver/compile не создастся.
# $(eval $(call BuildPackage,luci-app-torrserver))
