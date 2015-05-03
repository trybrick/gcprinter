Emitter = require('emitter')
loadScriptOnce = require('load-script-once')
loadScript = require('load-script')
win = window
isReady = false
isSecureSite = win.location.protocol.indexOf("https") >= 0

###*
# gciprinter
###
class gciprinter
  doc: win.document
  key: 'new'
  api: 'https://clientapi.gsn2.com/api/v1/ShoppingList//CouponPrint'
  hasInit: false
  isDebug: false
  constructor: ->
    # coupons inc require that we always load script
    sc = "//cdn.cpnscdn.com/static/libraries/js/printcontrol_v3"
    scExtension = if self.isDebug then ".js" else ".min.js"
    loadScriptOnce "#{sc}#{scExtension}", ->
      gcprinter.init()

    if !isReady
      myHtml = '<input type="hidden" id="https-supported" name="https-supported" value="true">'
      document.write "<!--[if (lte IE 9) & (cpbrkpie) & (gte cpbrkpie 5.0200)]>\n#{myHtml}\n<![endif]-->"
  printCallback: (svrRsp) ->
    if (svrRsp.Success)
      evt = {cancel: false, data: svrRsp}
      gcprinter.emit('printing', evt)
      if !evt.cancel
        gcprinter.printWithToken svrRsp.Token
    else
      gcprinter.emit('printfail', svrRsp)
  print: (siteId, coupons) ->
    if !self.hasInit
      return false
    win.gcprinterCallback = self.printCallback
    deviceId = self.getDeviceId()
    payload = encodeURIComponent(coupons.join(','))
    loadScript "#{self.api}/#{self.siteId}/#{deviceId}?callback=gcprinterCallback&coupons=#{payload}"
    return true
  printWithToken: (printToken) ->
    self = @
    # should have already init the printer
    COUPONSINC.printcontrol.printCoupons printToken, (e)->
      gcprinter.emit 'printed', e
    return self
  checkInstall: (fnSuccess, fnFail) ->
    fn = COUPONSINC.printcontrol.installCheck(self.key)
    jQuery.when(fn).then fnSuccess, fnFail
    @
  hasPlugin: () ->
    return COUPONSINC.printcontrol.isPrintControlInstalled()
  getDeviceId: () ->
    return COUPONSINC.printcontrol.getDeviceID()
  init: () ->
    if !gcprinter.hasInit and COUPONSINC?
      COUPONSINC.printcontrol.init(self.key, isSecureSite)
      fn = COUPONSINC.printcontrol.init(self.key, isSecureSite)
      cb = ->
        gcprinter.hasInit = true
      jQuery.when(fn).done cb

Emitter(gciprinter.prototype)
gcprinter = new gciprinter()

jQuery(document).ready ->
  isReady = true
  gcprinter.init()

win.gcprinter = gcprinter
module.exports = gcprinter