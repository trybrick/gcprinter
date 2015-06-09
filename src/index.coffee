Emitter = require('emitter')
trim = require('trim')
debug = require('debug')
log = debug('gcprinter')
win = window
isDocReady = false
isSecureSite = win.location.protocol.indexOf("https") >= 0
initRequiredMsg = 'because plugin has not been initialized'

###*
# gciprinter
###
class gciprinter
  doc: win.document
  key: 'new'
  api: 'https://clientapi.gsn2.com/api/v1/ShoppingList/CouponPrint'
  isReady: false
  hasInit: false
  cacheResult: {}
  debug: debug
  isWindows: navigator.platform.indexOf('Win') > -1
  isMac: navigator.platform.indexOf('Mac') > -1
  isChrome: /chrome/i.test(navigator.userAgent)
  dl: 
    win: "http://cdn.coupons.com/ftp.coupons.com/partners/CouponPrinter.exe"
    mac: "http://cdn.coupons.com/ftp.coupons.com/safari/MacCouponPrinterWS.dmg"

  ###*
   * create a new instance of gciprinter
   * @return {Object}
  ###
  constructor: ->
    self = @
    # document not ready means we can do document write
    if !isDocReady
      myHtml = '<input type="hidden" id="https-supported" name="https-supported" value="true">'
      document.write "<!--[if (lte IE 9) & (cpbrkpie) & (gte cpbrkpie 5.0200)]>\n#{myHtml}\n<![endif]-->"

    # coupons inc require that we always load script
    sc = "https://cdn.cpnscdn.com/static/libraries/js/printcontrol_v3"
    scExtension = if debug.enabled('gcprinter') then ".js" else ".min.js"
    jQuery.ajax
      type: 'GET'
      url: "#{sc}#{scExtension}"
      dataType: 'script'
      contentType: 'application/json'

  ###*
   * Log a message
   * @param  {string} msg message
   * @return {Object}    
  ###
  log: (msg) ->
    self = @
    log msg
    return self

  ###*
   * print coupon provided site or chainid and coupons array
   * @param  {Number} siteId  Site or Chain Id
   * @param  {Array}  coupons array of manufacturer coupon codes
   * @return {Object} 
  ###
  print: (siteId, coupons) ->
    self = @
    self.init()
    if !self.isReady
      gcprinter.log "print - false - #{initRequiredMsg}"
      return false

    deviceId = self.getDeviceId()
    if (deviceId < 1)
      gcprinter.log "printinvalid - bad device id #{deviceId}"
      gcprinter.emit('printinvalid', 'gsn-device')
      return

    payload = trim((coupons or []).join(','))
    if (payload.length > 0)
      payload = encodeURIComponent(payload)
      jQuery.ajax
        type: 'GET'
        url: "#{self.api}/#{siteId}/#{deviceId}?callback=?&coupons=#{payload}"
        dataType: 'jsonp'
      .done (svrRsp)->
        if (svrRsp.Success)
          evt = { cancel: false }
          if !evt.cancel
            gcprinter.emit('printing', evt, svrRsp)
            gcprinter.printWithToken svrRsp.Token, svrRsp
          else
            gcprinter.emit('printfail', 'gsn-cancel', svrRsp)
        else
          gcprinter.emit('printfail', 'gsn-server', svrRsp)
    else
      gcprinter.log "printinvalid - no coupon payload"
      gcprinter.emit('printinvalid', 'gsn-no-coupon')

    return true

  ###*
   * print coupon provided a token
   * @param  {string} printToken token
   * @param  {Object} rsp        server side response object
   * @return {Object}           
  ###
  printWithToken: (printToken, rsp) ->
    self = @
    self.init()
    if !self.isReady
      gcprinter.log "printWithToken - false - #{initRequiredMsg}"
      return false
    # should have already init the printer
    COUPONSINC.printcontrol.printCoupons printToken, (e)->
      gcprinter.log "printed #{e}"
      if (e is 'blocked')
        gcprinter.emit 'printfail', e, rsp
      else
        gcprinter.emit 'printed', e, rsp

    return self

  ###*
   * allow callback to check if coupon printer is installed
   * @param  {Function} fnSuccess 
   * @param  {Function} fnFail    
   * @return {Object}          
  ###
  checkInstall: (fnSuccess, fnFail) ->
    self = @
    self.init()
    if !self.isReady
      gcprinter.log "checkInstall - false - #{initRequiredMsg}"
      return false

    cb = (e) ->
      if e?
        jQuery.extend(self.cacheResult, e)
        self.cacheResult.isPrinterSupported = if e.isPrinterSupported is 0 then false else true
        if e.deviceId > 0
          if fnSuccess? 
            fnSuccess(e)
        else if (fnFail) 
          fnFail(e)
      else if (fnFail)
        fnFail()

    type = if self.isChrome then 'new' else 'old'
    COUPONSINC.printcontrol.installCheck(type, cb)
    @  

  ###*
   * determine if plugin is installed
   * @return {Boolean}
  ###
  hasPlugin: () ->
    self = @
    self.init()
    if !self.isReady
      gcprinter.log "hasPlugin - false - #{initRequiredMsg}"
      return false
    return COUPONSINC.printcontrol.isPrintControlInstalled()

  ###*
   * 
  ###
  getUpdateSupported: () ->
    self = @
    self.init()
    if !self.isReady
      gcprinter.log "getUpdateSupported - false - #{initRequiredMsg}"
      return false
    return COUPONSINC.printcontrol.getUpdateSupported()
    
  ###*
   * get the plugin device id
   * @return {Object}
  ###
  getDeviceId: () ->
    self = @
    self.init()
    if !self.isReady
      gcprinter.log "getDeviceId - 0 - #{initRequiredMsg}"
      return 0

    if (self.cacheResult.deviceId?)
      return self.cacheResult.deviceId

    return self.cacheResult.deviceId = COUPONSINC.printcontrol.getDeviceID()

  ###*
   * determine if printer is supported (not pdf/xps/virtual printer etc..)
   * @return {Boolean}
  ###
  isPrinterSupported: () ->
    self = @
    self.init()
    if !self.isReady
      gcprinter.log "isPrinterSupported - false - #{initRequiredMsg}"
      return false

    if (self.cacheResult.isPrinterSupported?)
      return self.cacheResult.isPrinterSupported 
    
    return self.cacheResult.isPrinterSupported = COUPONSINC.printcontrol.isPrinterSupported()

  ###*
   * determine if plugin is blocked
   * @return {Boolean}
  ###
  isPluginBlocked: () ->
    self = @
    self.init()
    if !self.isReady
      gcprinter.log "isPluginBlocked - false - #{initRequiredMsg}"
      return false
    result = !self.isWebSocket()  
    if result
      result = COUPONSINC.printcontrol_plugin.isPluginBlocked()
    return result

  ###*
   * determine if plugin uses websocket
   * @return {Boolean}
  ###
  isWebSocket: () ->
    self = @
    self.init()
    if !self.isReady
      gcprinter.log "isWebSocket - false - #{initRequiredMsg}"
      return false
    return COUPONSINC.printcontrol.getManager().getSocket?

  ###*
   * get the current status code
   * @return {string} status code
  ###
  getStatus: () ->
    self = @
    self.init()
    if !self.isReady
      gcprinter.log "getStatus - false - #{initRequiredMsg}"
      return false
    
    if (self.initResult? and self.initResult.deviceId < 0)
      return self.initResult.status

    return COUPONSINC.printcontrol.getStatusCode()

  ###*
   * get the plugin download url
   * @param  {Boolean} isWindows true if windows
   * @return {[string}            the download URL
  ###
  getDownload: (isWindows) ->
    self = @
    if isWindows or self.isWindows
      return self.dl.win
    
    return self.dl.mac

  ###*
   * initialize COUPONSINC object
   * @return {Object}
  ###
  init: () ->
    self = gcprinter
    if !self.isReady and COUPONSINC?
      if (self.hasInit) then return self
      self.hasInit = true
      self.log "init starting"
      cb = (e) ->
        self.log "init completed"
        self.isReady = true
        self.initResult = e
  
        if e?
          jQuery.extend(self.cacheResult, e)
          self.cacheResult.isPrinterSupported = if e.isPrinterSupported is 0 then false else true
  
        self.emit('initcomplete', self)
      jQuery.when(COUPONSINC.printcontrol.init(self.key, isSecureSite)).then cb, cb
    return self

Emitter(gciprinter.prototype)
if win.gcprinter?
  gcprinter = win.gcprinter
else
  gcprinter = new gciprinter()

jQuery(document).ready ->
  isDocReady = true

win.gcprinter = gcprinter
module.exports = gcprinter