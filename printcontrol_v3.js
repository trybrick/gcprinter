/*jslint sloppy: true, white: true, undef: true */
/*global window:true, document:true, COUPONSINC:true, location:true */
//Safe console.log
if (typeof console === "undefined" || typeof console.log === "undefined") {
    var console = {
        log: function() {}
    };
}

//Creating COUPONSINC obj if it is not defined
if (typeof COUPONSINC === 'undefined') {
    COUPONSINC = {};
}

/**
 * COUPONSINC.printcontrol
 */
COUPONSINC.printcontrol = (function($) {
    var PLUGIN_MIME_MAC = "application/couponsinc-printer-plugin",
        PLUGIN_MIME_WIN = "application/couponsinc-moz-printer-plugin-v401",
        mime = (/mac/i.test(navigator.platform) === true) ? PLUGIN_MIME_MAC : PLUGIN_MIME_WIN,
        manager = null,
        printcontrolInstalled = false,
        updateSupported = true,
        defSocket, //Deferred Object for checking websocket supported by printcontrol
        defInit, //Deferred Object for checking to load print control

        CPS_SUPPORT_VERSION = "5.0.0.0", //Minimum printcontrol version that support CPS
        CPS_SUPPORT_HTTPS_VERSION = "6.0.2.5", //Minimum printcontrol version that support CPS & HTTPS
        HTTPS_SUPPORT_VERSION = (/mac/i.test(navigator.platform) === true) ? "5.1.4" : "5.0.2.5"; //Minimum printcontrol version that support HTTPS (from navigation.mimeType)

    //Helper function checking on a device that cannot install print control. do nothing
    //currently looking for iPhone, iPod, iPad, Silk, and Android in UA
    //regex takes 1ms in chrome, 0ms in firefox, and 0ms in IE8

    function isInstallSupported() {
        return (navigator.userAgent.match(/(iP([a|o]d|hone)|Silk|Android|Linux|IEMobile)/) !== null) ? false : true;
    }

    /**
     * Helper function to compare 2 numeric version string
     * @return 0 :  2 equal versions
     *         -1: strV1 < strV2
     *         1 : strV1 > strV2
     */

    function compareVersions(strV1, strV2) {
        var nRes = 0,
            parts1 = (strV1 === null) ? [] : strV1.split('.'),
            parts2 = (strV2 === null) ? [] : strV2.split('.'),
            nLen = Math.max(parts1.length, parts2.length),
            i = 0,
            nP1 = 0,
            nP2 = 0;
        for (i = 0; i < nLen; i++) {
            nP1 = ((i < parts1.length) && !isNaN(parseInt(parts1[i], 10))) ? parseInt(parts1[i], 10) : 0;
            nP2 = ((i < parts2.length) && !isNaN(parseInt(parts2[i], 10))) ? parseInt(parts2[i], 10) : 0;
            if (nP1 !== nP2) {
                nRes = (nP1 > nP2) ? 1 : -1;
                break;
            }
        }
        return nRes;
    }

    /**
     * Helper function checking if websocket is supported, it's a promise function that will be resolved when printcontrol support websocket,
     * and rejected otherwise.
     * Conditions:
     * -- new user without printcontrol, or printcontrol version getting from mimeTypes supported cps (v. > 5.0.0.0)
     * -- browser support websocket
     * @method isWebSocketSupported
     */

    function isWebSocketSupported(key) {
        // this  line tells  the  browser to  refresh the list  of
        // plugins that  are available to  the page, thus  finding
        // anything new that has been installed.
        // the  false argument tells it  not to  reload the  pages.
        navigator.plugins.refresh(false);
        var pluginversion = getPrintControlVersion();

        defSocket = $.Deferred(); //Deferred Object for websocket checking

        //If key configuration is not set to support socket, or WebSocket is not supported by browser, reject promise right away
        //For IE, even with websocket enabled, we encounter security issue while trying to connect to localhost with websocket
        //therefore, IE set to plugin for now. this eventually will need to get fixed
        //on a device that cannot install print control. do nothing
        if (!('WebSocket' in window) || (isInstallSupported() === false)) {
            console.log('Websocket is not in browser.');
            defSocket.reject();
            return defSocket.promise();
        }
        console.log('iswebsocketSupported=' + COUPONSINC.isSecureSite);

        //If key configuration is not set to support socket, reject promise right away
        //For IE, even with websocket enabled, we encounter security issue while trying to connect to localhost with websocket
        if ((key === "old") || (('ActiveXObject' in window) && (COUPONSINC.printcontrol_plugin.isActiveXFiltering() === true))) {
            console.log('key is old. Use plugin in this case');
            defSocket.reject();
            return defSocket.promise();
        }

        //In some browser, such as chrome 32.1700.0.76, we hit this case when mimeType is not existed,
        //or updated when we first installed, fixing this issue by creating a flag printcontrolInstalled,
        //because socket successfully means plugin is there, but hidden
        //that's when we try websocket connection beofore decide that socket is not supported with our printcontrol
        $.when(
            COUPONSINC.printcontrol_websocket.isWebsocketConnectionReadyPromise()
        ).then(
            function() {
                printcontrolInstalled = true;
                defSocket.resolve();
            },
            function() {
                //Service is actually running, but there is no .cid files available for socket to get its data,
                //In this case, user C:\Windows\Temp directory is NOT writable, so fall back to plugin->blocked in this case
                if (this.errfile) {
                    updateSupported = false;
                }
                console.log("Fallback: plugin manager used");
                defSocket.reject();
            }
        );
        return defSocket.promise();
    }

    /**
     * Function to decide load approprite printcontrol file
     * When browser support websocket, load printcontrol_websocket file
     * Else, load printcontrol_plugin
     * @params callback function to be call after the file is loaded
     * @method loadPrintControlFile
     */

    function loadPrintControlFile(key) {
        var def = $.Deferred();
        //If configuration is set to use websocket, and if websocket available in the browser, with the correct plugin version,
        //that have websocket support (5.0.0.0 or above), then loading printcontrol_websocket file
        $.when(
            isWebSocketSupported(key)
        ).then(
            function() { //Using Websocket
                console.log('Print control use socket');
                manager = COUPONSINC.printcontrol_websocket;
                def.resolveWith({
                    timewait: 400,
                    maxTry: 2
                });
            },
            function() { //Using plugin
                console.log('Print control use plugin');
                console.log("create plugin instance");
                manager = COUPONSINC.printcontrol_plugin;
                def.resolveWith({
                    timewait: 400,
                    maxTry: 50
                });
                //If loading printcontrol plugin, we will need to create ctrlObj plugin instance if it does not exist yet!
            }
        );
        return def.promise();
    }

    /**
     * Function that checks if the plugin is installed
     * @returns boolean
     */

    function isPrintControlInstalled() {
        if (!(isInstallSupported())) { //On device that is not supporting printing
            return false;
        }

        if (printcontrolInstalled) { //If the flag for printcontrol installed is set, resolved right away
            return true;
        }

        if (typeof manager.getPluginInstance !== "undefined") {
            return (manager.getPluginInstance() === null) ? false : true;
        }

        // this  line tells  the  browser to  refresh the list  of
        // plugins that  are available to  the page, thus  finding
        // anything new that has been installed.
        // the  false argument tells it  not to  reload the  pages.
        navigator.plugins.refresh(false);

        // test if plugin installed by checking mimeTypes
        return ((typeof navigator.mimeTypes[PLUGIN_MIME_MAC] !== "undefined") || (typeof navigator.mimeTypes[PLUGIN_MIME_WIN] !== "undefined"));
    }

    /**
     * Function to getback the correct printmanager should used
     * @method getManager
     */

    function getManager() {
        return manager || COUPONSINC.printcontrol_plugin;
    }

    /**
     * Function getting updateSupported value
     */

    function getUpdateSupported() {
        if (!updateSupported) { //Case fail to connect to socket due to system permission
            return false;
        }
        if (COUPONSINC.isSecureSite === true) {
            return (compareVersions(getPrintControlVersion(), HTTPS_SUPPORT_VERSION) < 0);
        } else {
            return (compareVersions(getPrintControlVersion(), CPS_SUPPORT_VERSION) < 0);
        }

    }

    //GetDeviceID

    function getDeviceID() {
        return getManager().getDeviceID();
    }

    //CheckPrinter

    function isPrinterSupported() {
        return getManager().isPrinterSupported();
    }

    //GetStatsCode

    function getStatusCode() {
        return getManager().getStatusCode();
    }

    /**
     * @method getVersion to get Version from mimetype (notice that this method is not totally reliable with navigator.mimeType is not always reliable)
     */

    function getPrintControlVersion() {
        var version = "",
            plugin = null;

        if (typeof navigator.mimeTypes[mime] !== "undefined") {
            plugin = navigator.mimeTypes[mime];
            if (typeof plugin.enabledPlugin !== "undefined") { //IE detection for version
                version = plugin.enabledPlugin.version || "";
            }
            if (version === "" && typeof plugin.description !== "undefined") {
                //Getting it from version if it's defined, since version supported CPS,
                //the description is unified to have version number in both Mac and window platform
                version = /.*[\s-](\S+)/.exec(plugin.description)[1];
            }
        }

        return version;
    }

    /**
     * Helper function to detect if printcontrol is supporting HTTPS (version > 5.0.2.0)
     * Note: since the function conatins the logic where we'll need to call socket and wait for it to return,
     * this need to be a promise
     * object deferredHTTPS is rejected when printcontrol don't need update to support https
     * object deferredHTTPS is resolved when printcontrol need update to support https
     * @method existingPrintControlNeedHTTPSSupport
     */

    function existingPrintControlNeedHTTPSSuppport() {
        var deferredHTTPS = $.Deferred();
        //Checking version will mostly available on IE11, Chrome, Window
        if (compareVersions(getPrintControlVersion(), HTTPS_SUPPORT_VERSION) >= 0) {
            deferredHTTPS.reject();
        } else if ($("#https-supported").length > 0 && $("#https-supported").val() === "true") {
            //For IE8,9, the detection of HTTPS support is through IE conditional tags
            deferredHTTPS.reject();
        } else if (localStorage !== undefined && localStorage.getItem("https-supported")) { //If https-supported is set, which means IE10 already check wbesocket and version satisfy.
            deferredHTTPS.reject();
        } else { //Worst case, IE10, new printcontrol support https, however, there is no localstorage set
            if (('WebSocket' in window) && ('ActiveXObject' in window)) {
                $.when(
                    COUPONSINC.printcontrol_websocket.getPrintControlVersion()
                ).then(
                    function() { //resolve promise
                        //set localstorages
                        if (localStorage !== undefined) {
                            localStorage.setItem("https-supported", true); //Set localstorage to make sure we don't have to go to update flow again
                        }
                        if (compareVersions(this.version, CPS_SUPPORT_HTTPS_VERSION) >= 0) {
                            deferredHTTPS.reject();
                        } else {
                            deferredHTTPS.resolve(); //need update
                        }
                    },
                    function() { //reject promise
                        deferredHTTPS.resolve(); //need update
                    }
                );
            } else {
                deferredHTTPS.resolve(); //need update
            }
        }
        return deferredHTTPS.promise();
    }

    /*******************************************************************************************
     * The 3 functions below will be helper to partner to initiate the plugin,
     * or checking for update flow
     * Including:
     * init()
     * printCoupons()
     * installCheck()
     *******************************************************************************************/

    function processPrintControlInit(key, callback) {
        $.when(
            loadPrintControlFile(key)
        ).then(
            function() {
                $.when(
                    getManager().getPrintControlPromise(this.maxTry, this.timewait, false)
                ).then(
                    function() {
                        if (callback) {
                            callback(this);
                        }
                        console.log("DeviceId:" + this.deviceId);
                        console.log("IsPrinterSupported:" + this.isPrinterSupported);
                        if (getManager().isPluginBlocked && getManager().isPluginBlocked() === true) {
                            console.log("Print control use plugin, but plugin is being blocked");
                            this.isPluginBlocked = true;
                            defInit.resolveWith(this);
                        } else {
                            defInit.resolveWith(this);
                        }
                    },
                    function() {
                        //Reject promise, printer not installed
                        var rejectObj = {
                            deviceId: -1,
                            isPrinterSupported: 0,
                            status: -1
                        };
                        if (callback) {
                            callback(rejectObj);
                        }
                        defInit.reject(rejectObj);
                    }
                );
            }
        );
        return defInit.promise();
    }

    /**
     * Function execute on page load to get deviceid
     */

    function init(key, isSecureSite, callback) {
        defInit = $.Deferred();
        COUPONSINC.isSecureSite = isSecureSite;
        console.log('isSecureSite:' + COUPONSINC.isSecureSite);

        processPrintControlInit(key, callback);
        return defInit.promise();
    }

    //Printcoupons

    function printCoupons(printToken, callback) {
        var def = $.Deferred();
        $.when(
            getManager().printCoupons(printToken)
        ).then(
            function() { //printcoupons resolve
                if (callback) {
                    callback(this.status);
                }
                console.log("print coupons successfully with status: " + this.status);
                def.resolve(this.status);
            },
            function() { //printcoupons reject (either not installed or blocked)
                //Partner do something here if needed
                if (callback) {
                    if (!COUPONSINC.printcontrol_plugin.isPluginInstalled()) {
                        callback("not-installed")
                    } else {
                        callback("blocked");
                    }
                }
                def.reject();
            }
        );
        return def.promise();
    }

    //Install printcontrol

    function installCheck(key, callback) {
        //Set up flag for install
        var def = $.Deferred(),
            printManager,
            rejectObj = {
                deviceId: -1,
                isPrinterSupported: 0,
                status: -1
            };
        COUPONSINC.printcontrol.controller = "install";

        if (key === "old") {
            printManager = COUPONSINC.printcontrol_plugin;
        } else {
            printManager = COUPONSINC.printcontrol_websocket;
        }

        $.when(
            printManager.getPrintControlPromise(180, 3000, true)
        ).then(
            function() { //promise resolved
                if (callback) {
                    callback(this);
                }
                console.log("DeviceId:" + this.deviceId);
                console.log("IsPrinterSupported:" + this.isPrinterSupported);
                def.resolve(this);
            },
            function() { //promise rejected
                if (callback) {
                    callback(rejectObj);
                }
                console.log("Install failed");
                def.reject(rejectObj);
            }
        );
        return def.promise();
    }

    return {
        init: init,
        getUpdateSupported: getUpdateSupported,
        getManager: getManager,
        getStatusCode: getStatusCode,
        getDeviceID: getDeviceID,
        isPrinterSupported: isPrinterSupported,
        loadPrintControlFile: loadPrintControlFile,
        isPrintControlInstalled: isPrintControlInstalled,
        printCoupons: printCoupons,
        installCheck: installCheck,
        existingPrintControlNeedHTTPSSuppport: existingPrintControlNeedHTTPSSuppport
    };

}(jQuery));
/**
 * COUPONSINC.printcontrol_plugin
 */
COUPONSINC.printcontrol_plugin = (function($) {

    var PLUGIN_MIME_MAC = "application/couponsinc-printer-plugin",
        PLUGIN_MIME_WIN = "application/couponsinc-moz-printer-plugin-v401",
        PLUGIN_CLASSID = "CLSID:9522B3FB-7A2B-4646-8AF6-36E7F593073C",
        PLUGIN_CLASSID_x64 = "CLSID:1A53AD8B-D0B9-4E7F-88E4-50C07A65F2DC",
        PLUGIN_PROGID = "cpbrkpie.Coupon6Ctrl.1",
        PLUGIN_PROGID_x64 = "coupons.couponprinter_x64.1",
        CONTROL_ID = "couponsinc-printcontrol",
        mime = (/mac/i.test(navigator.platform) === true) ? PLUGIN_MIME_MAC : PLUGIN_MIME_WIN,
        ctrlObj = null;

    /**
     * Helper function to detect if ActiveX filtering is enabled
     * @method isActiveXFiltering
     */

    function isActiveXFiltering() {
        return (typeof window.external.msActiveXFilteringEnabled !== "undefined" && window.external.msActiveXFilteringEnabled() === true);
    }

    /**
     * Function that checks if the plugin is installed
     * @returns boolean
     */

    function isPluginInstalled() {
        // test if plugin installed by checking mimeTypes
        return ((typeof navigator.mimeTypes[PLUGIN_MIME_MAC] !== "undefined") || (typeof navigator.mimeTypes[PLUGIN_MIME_WIN] !== "undefined"));
    }

    /**
     * Checks is a plugin is being blocked VS not installed
     * @returns {Boolean}
     */

    function isPluginBlocked() {
        var pluginType,
            testPluginInstance,
            installed = isPluginInstalled(),
            pluginStatus = null;
        // test Navigator.mimetypes
        if ("ActiveXObject" in window) { // IE
            pluginType = getPluginPlatform();
            try {
                testPluginInstance = new ActiveXObject(pluginType.classID);
                return false;
            } catch (ex) {
                return false;
            }
        } else {
            if (installed === true) { // test is Instance returns a status code
                try {
                    pluginStatus = getStatusCode();
                    if (typeof pluginStatus !== "undefined") {
                        return false;
                    } else {
                        return true;
                    }
                } catch (e) {
                    return true;
                }
            } else {
                return false;
            }
        }
    }

    /**
     * isPluginReady()  Check if the print control  plugin can be used.
     * It may  not be ready  immediately after  adding it to  DOM as it
     * usually makes one  or more HTTP requests to  check if it's up to
     * date  and such.  Usually you need to  implement a  setInterval()
     * around  isPluginReady()  to  keep checking.
     *
     * @method isPluginReady
     * @returns {Boolean} true if ready, false if not ready
     */

    function isPluginReady() {
        var statusCode,
            ready = false;

        try {
            statusCode = getStatusCode();
            ready = (statusCode !== 1); // !== 1 means ready
        } catch (e) {
            // somehow had a problem getting status code, not ready
            ready = false;
            console.log("printcontrol_plugin-isPluginReady: Exception " + e.name + ": " + e.message);
        }

        return ready;
    }

    function isPluginHappy() {
        var statusCode;

        if (ctrlObj === null) {
            return false;
        }

        // this scenario is what it looks like when the plugin crashes
        // we still have a ctrlObj that looks like an object, but status code is undefined
        if (typeof getStatusCode() === 'undefined') {
            return false;
        }

        statusCode = getStatusCode();

        // is it ready to go and we don't have to recheck the -1503 code?
        if (((statusCode !== -1000) && (statusCode !== 0)) && (statusCode !== -1503)) {
            return false;
        }

        // tests for corruption as the result of an OS upgrade
        if (/mac/i.test(navigator.platform) === true) {
            ctrlObj.PerformAction("cpnprt2", "GetDeviceID", "Y|", "|", false);
            statusCode = getStatusCode();
            if (statusCode === -1503) {
                return false;
            }
        }

        return true;
    }

    /**
     * Requests the device ID from the control that is passed in.
     * returns deviceID will be an integer with the following
     * meanings.
     * @param: ctrlObj  markup object that is the printer control
     *
     * returns:
     *    -1        error getting device ID reported by control
     *     0        error getting device ID no change to default value
     *    >0        real device ID
     */

    function getDeviceID(retries) {
        var deviceID = 0,
            deviceIDStatusCode = 0,
            remainingTries = (typeof retries === 'undefined') ? 1 : retries, // one retry unless otherwise specified
            retryErrorCodes = [-98]; // the status codes that are ok to retry

        if (isPluginHappy() === false) {
            console.log("printcontrol_plugin-getDeviceID: print control is NOT happy. StatusCode=" + getStatusCode());
            return -1;
        }

        try {
            // initial attempt to get the device ID
            deviceID = ctrlObj.PerformAction("cpnprt2", "GetDeviceID", "Y|", "|", false);
            deviceIDStatusCode = getStatusCode();
            // if the call returns properly, use that device ID
            if ((deviceIDStatusCode === 0) && (deviceID.toString().toLowerCase() !== "error")) {
                console.log("printcontrol_plugin-getDeviceID: print control returned getDeviceID=" + deviceID + ". StatusCode=" + getStatusCode());
                deviceID = parseInt(deviceID, 10);
            } else {
                // if the status code is a retry one and we still have retries, make the call again
                if (($.inArray(deviceIDStatusCode, retryErrorCodes) >= 0) && (remainingTries > 0)) {
                    // but make the call with one less retry
                    remainingTries -= 1;
                    deviceID = getDeviceID(remainingTries);
                } else {
                    // ran out of retries or the status code was fatal
                    deviceID = -1;
                    console.log("printcontrol_plugin-getDeviceID: deviceID is ERROR. StatusCode=" + getStatusCode());
                }
            }
        } catch (e) {
            console.log("printcontrol_plugin-getDeviceID: Exception " + e.name + ": " + e.message);
        }
        return deviceID;
    }

    /**
     * Check if user's printer is valid.
     * It returns true if the user's default printer is a physical printer without any invalid settings and false otherwise.
     * Invalid print settings include keeping printed jobs, printing out multiple copies.
     */

    function isPrinterSupported() {
        var status = false;

        if (isPluginHappy() === false) {
            console.log("printcontrol_plugin-isPrinterSupported: print control not happy. StatusCode=" + getStatusCode());
            return false;
        }

        try {
            status = ctrlObj.PerformAction("cpnprt2", "CheckPrinter", "Y|", "|", false);
            console.log("isPrinterSupported: print control returned isPrinterSupported=" + status);
            status = (status === 'true' || status === true);
        } catch (e) {
            console.log("printcontrol_plugin-isPrinterSupported: Exception " + e.name + ": " + e.message);
        }

        return status;
    }

    /**
     * Print the selected coupons.
     * This is a JS way of adding the iframe to the page dynamnically
     * to support same-page printing. Eventually, we should just
     * directly call the print control ourselves and direct it to
     * print, but we're not quite ready to do that large of a port yet.
     */

    function printCoupons(token) {
        var def = $.Deferred(),
            zipcode = 99999, // should always be set, but if not, set to '99999'
            distributorID = '9z9z9', // not needed, but still needs to be passed
            cobrand = '0', // always 0
            printtoken = 'DIRECT' + token,
            personalization = ' ',
            printPollHandle = null,

            // should look like this: "Y|2bp|0|DIRECTXUDNrXYDkx45018123000|94403| "
            printParamString = "Y|" + distributorID + "|" + cobrand + "|" + printtoken + "|" + zipcode + '|' + personalization;

        //If plugin is blocked, there is no ctrlObj to perform printCoupons action, therefore, resolve promise right away
        if (isPluginBlocked()) {
            def.resolve();
            return def.promise({
                status: "blocked",
                manager: "plugin"
            });
        }

        //Before calling printcoupons, we need to make sure that plugin is ready and happy
        $.when(
            getPrintControlPromise(50, 400, true)
        ).then(
            function() {
                ctrlObj.PerformAction("cpnprt2", "PrintCoupons", printParamString, "|", true);
                //printCoupons itself will be a promise return obj including printing status code for printing process
                printPollHandle = window.setInterval(function() {
                    var statusCode = getStatusCode();
                    if (!(statusCode <= -1000 || statusCode === 1)) {
                        window.clearInterval(printPollHandle);
                        def.resolveWith({
                            status: statusCode,
                            manager: "plugin"
                        });
                    }
                }, 1000);
            },
            function() {
                def.reject({
                    manager: "plugin"
                });
            }
        );

        return def.promise();
    }

    /**
     * @method getStatusCode
     */

    function getStatusCode() {
        return (ctrlObj.GetStatusCode) ? ctrlObj.GetStatusCode() : ctrlObj.StatusCode;
    }

    /**
     * Return printcontrol promise object for printcontrol state, and return object to decide on user interaction with the printcontrol
     * PrintControl plugin keep pulling stuffs for trying, therefore, passing parameter for maxTry counter
     * @method getPrintControlPromise
     */

    function getPrintControlPromise(maxTry, tryLength, checkPluginHappy) {
        var def = $.Deferred(),
            tryCount = 0,
            pollIntervalHandle = null,
            promiseObj = {};

        //If plugin is not installed based on navigator mimetype, reject right away
        if (!isPluginInstalled()) {
            def.rejectWith({
                pluginInstance: null,
                isInstalled: false
            });
            return def.promise();
        }

        // Keep polling plugin untl it's fully loaded and accessible
        pollIntervalHandle = window.setInterval(function() {

            if (tryCount >= maxTry) {
                // Too many number of re-tries is considered as error.
                window.clearInterval(pollIntervalHandle);
                def.rejectWith({
                    pluginInstance: ctrlObj
                }); //Reject promise completely when we already exceed max try
                return;
            }

            tryCount += 1;

            ctrlObj = getPluginInstance(); //Since this is a pulling process, need to reinitiate and check ctrlObj every pulling

            // is the printing software installed and ready to be used?
            // check if plugin is installed if not then show reject promise and throw user to install page right away
            if (checkPluginHappy && isPluginInstalled() && isPluginBlocked()) {
                window.clearInterval(pollIntervalHandle);
                def.rejectWith({
                    pluginInstance: ctrlObj,
                    installblocked: true
                });
                return;
            }

            //If need also check for pluginHappy, then only resolve object when both condition for pluginReady and pluginHappy met!
            if (checkPluginHappy && ctrlObj !== null && isPluginReady() && isPluginHappy()) {
                // If it's ready, no need to poll more, clear the interval timer
                window.clearInterval(pollIntervalHandle);
                def.resolveWith({
                    deviceId: getDeviceID(),
                    isPrinterSupported: isPrinterSupported(),
                    status: getStatusCode()
                });
                return;
            }

            //This piece of code only needed to check for the readiness state of print control plugin
            if (!(checkPluginHappy) && ctrlObj !== null && isPluginReady()) {
                // If it's ready, no need to poll more, clear the interval timer
                window.clearInterval(pollIntervalHandle);
                if (!(isPluginHappy())) {
                    var statusCode = getStatusCode();
                    if (statusCode === -1503) { //Corrupted print device, therefore, return invalid deviceId
                        promiseObj = {
                            deviceId: -1,
                            isPrinterSupported: 0,
                            status: statusCode
                        };
                    } else {
                        promiseObj = {
                            useCookiesValues: true,
                            status: statusCode
                        }; //This obj resolved, use deviceId and printerSupported value generated from the cookies
                    }
                    console.log('printcontrol_plugin: print control not happy. StatusCode=' + getStatusCode());
                } else { //If plugin is Happy
                    promiseObj = {
                        deviceId: getDeviceID(), //getDeviceId, statusCode will change from this pulling too
                        isPrinterSupported: isPrinterSupported(),
                        status: getStatusCode()
                    };
                }
                def.resolveWith(promiseObj);
                return;
            }
        }, tryLength);

        //Return promise object
        return def.promise();
    }

    /**
     * Helper function on print control to check if update for websocket printing is supported
     * Conditions:
     * -- Configure key match "new" (or "fallback")
     * -- Not IE (MIMETYPE not exists, not support socket at all)
     */

    function isUpdateSupported() {
        if (!COUPONSINC.printcontrol.getUpdateSupported()) { //If updateSupported already decided on pageload, return right away!
            return false;
        }
        return (isPluginInstalled() && isPluginBlocked());
    }

    /*******************************************************************
     *
     * THE FOLLOWING IS TRYING TO FIGURE OUT THE CONTROL PLUGIN OBJECT
     *
     *******************************************************************/
    /**
     * Create the one and only PrintControl object on the page.
     */

    function createPluginInstance() {
        // determine which code we use to check the install
        if ("ActiveXObject" in window) {
            // we have ActiveX, so we'll use that. This is ie.
            createActiveXPlugin();
        } else {
            // everyone else: chrome, safari, firefox, etc.
            createEmbedPlugin();
        }
    }

    /**
     * findActiveX()  check to see if the specified  activeX control is
     * even installed to make sure that we're not trying to instantiate
     * something that  doesn't exist, which will  throw an error  which
     * will  be
     * logged - often numerout times
     *
     * @method findActiveX
     * @param {String} prodID the activeX control to test
     * @returns {Object} activeX object if supported or null if not
     */

    function findActiveX(progID) {
        try {
            return new ActiveXObject(progID);
        } catch (ex) {
            return null;
        }
    }

    /**
     * Returns the plugin type according to the plugin.
     */

    function getPluginPlatform() {
        var pluginInfo = {};
        if (window.navigator.platform === "Win64") {
            pluginInfo = {
                classID: PLUGIN_CLASSID_x64,
                progID: PLUGIN_PROGID_x64
            };
        } else {
            pluginInfo = {
                classID: PLUGIN_CLASSID,
                progID: PLUGIN_PROGID
            };
        }

        return pluginInfo;
    }

    /**
     * Plugin on IE
     * @method createActiveXPlugin
     */

    function createActiveXPlugin() {
        var printManager = null,
            classID = null,
            progID = null,
            pluginType = getPluginPlatform();

        classID = pluginType.classID;
        progID = pluginType.progID;


        if (findActiveX(progID) === null) {
            return;
        }

        try {
            // Test to see if plugin is installed
            printManager = new ActiveXObject(progID);

            if (printManager) {
                ctrlObj = $("<object />", {
                    classid: classID,
                    id: CONTROL_ID,
                    name: CONTROL_ID,
                    width: 0,
                    height: 0,
                    LocationCode: "99999",
                    UserCode: "",
                    BricksCode: "USERID"
                });
                ctrlObj.appendTo('body').css("display", "none");

                ctrlObj = $('#' + CONTROL_ID)[0];
            }

        } catch (e) {
            // unable to establish contact with the plugin via activeX
            console.log("createActiveXPlugin: Exception " + e.name + ": " + e.message);
            ctrlObj = null;
        }
    }

    /**
     * Plugin on Chrome/FF/Safari...
     * @method createEmbedPlugin
     */

    function createEmbedPlugin() {
        var attrib = {
            width: "1",
            height: "1",
            style: "position:absolute;top:-9999px", //display:none will disable the plugin, so positioned off screen
            name: CONTROL_ID,
            id: CONTROL_ID
        };
        try {
            // this  line tells  the  browser to  refresh the list  of
            // plugins that  are available to  the page, thus  finding
            // anything new that has been installed.
            // the  false argument tells it  not to  reload the  pages.
            navigator.plugins.refresh(false);
            // Test to see if plugin is installed
            if (window.navigator.mimeTypes[mime]) {
                ctrlObj = $("<embed />", $.extend(attrib, {
                    type: mime
                }));
                ctrlObj.appendTo('body');
                ctrlObj = $('#' + CONTROL_ID)[0];
            }
        } catch (e) {
            console.log("createEmbedPlugin: Exception " + e.name + ": " + e.message);
            ctrlObj = null;
        }
    }

    /**
     * Retrieve the one and only print control plugin on the page.
     */

    function getPluginInstance() {
        if (ctrlObj === null) {
            createPluginInstance();
        }
        return ctrlObj;
    }

    return {
        getStatusCode: getStatusCode,
        getDeviceID: getDeviceID,
        isPrinterSupported: isPrinterSupported,
        isUpdateSupported: isUpdateSupported,
        printCoupons: printCoupons,
        getPrintControlPromise: getPrintControlPromise,
        isPluginInstalled: isPluginInstalled,
        isPluginBlocked: isPluginBlocked,
        getPluginInstance: getPluginInstance,
        isActiveXFiltering: isActiveXFiltering
    };
}(jQuery));
/**
 * COUPONSINC.printcontrol_websocketss
 */
COUPONSINC.printcontrol_websocket = (function($) {
    var socket = null, // Referece to the socket
        availableConnections = [2687, 26876], // Available ports
        connectionToTry = 1,
        checkPrintControlHappy = false,
        portToTry,
        retries = false, //flag to retry to get deviceID when deviceID is corrupted
        websocketPrefix = "ws://127.0.0.1",
        websocketModulePrefix = "module=cpnprt2ws;",
        statusCode = null,
        deviceID = null,
        version = null,
        printerSupported = null,
        promiseObj,
        checkDeviceOnLoad = false, //Need to check for deviceID when websocket connected,
        //to make sure that websocket response, and user able to access cids file in their temp directories
        deferredGetValues = null, // Deferred object for the promise to get values from the WS
        deferredGetVersion = null, // Deferred object that olds the promise used for getversion on websocket (if necessary)
        deferredPrint = null, // Deferred object that olds the promise used for printing.
        deferredSocket = null, // Deferred object to handle all socket related operations.
        printInProgress = false, // Determines if the print is currently in progress.
        // Set to true when Print is sent to Service and completes
        // when we get the status code after print completes
        // We need to wait before retrying on the install pages. So that the user has time to update the socket.
        checkVersion = false,
        // ON the print page Since this might be the first time user is using a Websocket Wait time is recomended
        waitTime = 0,
        maxConnectionTry = 2,

        //Define values for websocket connection on HTTPS
        HTTPS_WEBSOCKET = "wss://printer.cpnprt.com",
        HTTPS_TIME_TERMINATE = 3500,
        HTTPS_PORT = [4004];

    /**
     * Return printcontrol promise object for printcontrol state, and return object to decide on user interaction with the printcontrol
     * PrintControl plugin keep pulling stuffs for trying, therefore, passing parameter for maxTry counter
     * @method getPrintControlPromise
     */

    function getPrintControlPromise(maxTry, tryLength, checkPrintInstallHappy) {
        console.log('starting getPrintControlPromise');
        deferredGetValues = $.Deferred();
        checkPrintControlHappy = checkPrintInstallHappy || false; //in install flow, project obj should only be resolved when print device is not corrupted.
        $.when(
            isWebsocketConnectionReadyPromise(maxTry, tryLength)
        ).then(
            function() { //socket is ready, try to get device
                sendGetDeviceID();
            },
            function() { //TODO: connect to socket fail,will need fall back here
                statusCode = (!COUPONSINC.printcontrol.isPrintControlInstalled()) ? "not-installed" : "socket-failed";
                deferredGetValues.rejectWith({
                    pluginInstance: null,
                    statusCode: statusCode
                });
            }
        );
        return deferredGetValues.promise();
    }

    /**
     * Promise related to
     * @return {@exp;deferredSocket@call;promise}
     */

    function isWebsocketConnectionReadyPromise(maxTry, tryLength) {
        //Deferred Object
        if ((socket === null) || (socket.readyState === socket.CLOSED)) {
            connectionToTry = 1;
            deferredSocket = $.Deferred();
        } else {
            deferredSocket = deferredSocket || $.Deferred();
        }

        tryWebSocketConnection(maxTry, tryLength);
        return deferredSocket.promise();
    }

    /**
     * Function that actually tries to establish a websocket connection
     */

    function tryWebSocketConnection(maxTry, tryLength, checkVersion) {
        var connectionUrl,
            statuscode,
            timeToTerminate = 500,
            manageSocketTimeout = true;
        maxConnectionTry = maxTry || maxConnectionTry || 2;
        waitTime = tryLength || waitTime || 0;
        if ((COUPONSINC.isSecureSite === true) || (window.location.protocol === 'https:')) {
            availableConnections = HTTPS_PORT;
            websocketPrefix = HTTPS_WEBSOCKET;
            timeToTerminate = 3500;
        }

        if (connectionToTry > maxConnectionTry) { // If we  have already tried to connect max number of times.
            console.log("socket failed. Fall back to plugin");
            deferredSocket.reject(); //Reject object when websocket connection failed
            return;
        }
        portToTry = availableConnections[connectionToTry % availableConnections.length];
        connectionUrl = websocketPrefix + ":" + portToTry;
        console.log('try websocket: ' + connectionUrl);

        try {
            if (socket === null || (socket.readyState === socket.CLOSED)) { // Connection is not ready yet. Setup connection
                console.log('connection to:' + connectionUrl + ", timetry=" + connectionToTry);
                socket = new WebSocket(connectionUrl);
                socket.onopen = function() {
                    onOpen(checkVersion);
                };
                socket.onmessage = onMessage;
                socket.onclose = onClose;
                socket.onerror = onError;
            } else {
                console.log("socket already open");
                manageSocketTimeout = false;
                return;
            }
        } catch (ex) {
            //Silent catching
        }
        //console.log(COUPONSINC.printcontrol.controller);
        //Need to set a timer here on pageload, if socket takes too long, terminate the process to prevent the page takes too long to load
        if (manageSocketTimeout && COUPONSINC.printcontrol.controller !== "install") {
            //console.log("dimiss long time connection to sockect");
            setTimeout(function() {
                try {
                    if (socket !== null && socket.readyState === socket.CONNECTING) {
                        socket.close();
                        socket = null;
                    }
                } catch (ex) {
                    //Silent catching error
                }
            }, timeToTerminate);
        }
    }

    /**
     * Promise funtion to return particular version of print control
     * @getPrintControlVersion
     */

    function getPrintControlVersion() {
        deferredGetVersion = $.Deferred();
        checkVersion = true;
        $.when(
            isWebsocketConnectionReadyPromise(2, 0)
        ).then(
            function() {
                deferredGetVersion.resolveWith({
                    "version": this.version
                });
            },
            function() {
                deferredGetVersion.reject();
            }
        );

        return deferredGetVersion.promise();
    }

    /**
     * Handler for when the websocket connection is succesful
     * @return {undefined}
     */

    function onOpen() {
        console.log('connected successfully to ' + portToTry);
        if (checkVersion) {
            sendGetVersion();
            checkVersion = false;
        } else {
            sendGetDeviceID(); //Send getDeviceID everytime to make sure that it's what we expected from cids file, prevent the case when service running but cids file not exist
            if (!retries) { //only checkdevice again if it' not on corrupted mode
                checkDeviceOnLoad = true;
            }
        }
    }

    /**
     * handler for when websocket sees an error
     * @return {undefined}
     */

    function onError() {
        console.log("Failed. Time to take socket throwing errors timeout to connect");
        try {
            if ((socket !== null) && (socket.readyState === socket.OPEN)) {
                socket.close();
            }
        } catch (ex) {
            //Silent catching exception
        }
    }

    /**
     * Event handler called when socket is closed. Do any cleanup tasks
     * @return {undefined}
     */

    function onClose() {
        console.log("connection close");
        connectionToTry += 1;
        socket = null; //Reset socket to null, to keep the logging sequence also in place and clean
        //If connection fail, wait before we try it again, depending on browser, the reconnection will happen very fast,
        //that's probably not what we want, especially in the install flow, when the download from user might be take longer than expected.
        setTimeout(function() {
            tryWebSocketConnection();
        }, waitTime);
    }

    /**
     * Handler when the websocket object recieves a message the CPS
     * @param {type} e Data recieved from the socket
     * @return {@exp;deferredPrint@call;promise}
     */

    function onMessage(e) {
        console.log('Starting to send message.');
        var message = parseMessage(e.data);
        if (message.GetVersion !== undefined) {
            version = message.GetVersion;
            deferredSocket.resolveWith({
                "version": version
            });
            return; //Don't proceed the next step, only checking for version
        }
        if (message.GetDeviceID !== undefined) {
            deviceID = message.GetDeviceID;
            if (message.GetStatusCode !== undefined) {
                statusCode = message.GetStatusCode;
            }
            //If it's a check device action on testing socket connection, return right away
            if (checkDeviceOnLoad) {
                console.log("deviceOnLOAD: " + checkDeviceOnLoad);
                checkDeviceOnLoad = false;
                //Check statusCode to satify socket requirements, if -500 < statusCode < -700 ==> Cannot write cids file to user temp,
                //in these case, socket is running, but we are not getting back the correct deviceID or printer supported,
                //therefore, fall back to plugin if statusCode in the range [-500, -700)
                if (deviceID.toString().toLowerCase() === 'file not found' || (statusCode < -500 && statusCode > -700)) {
                    deferredSocket.rejectWith({
                        'errfile': true
                    });
                } else {
                    deferredSocket.resolve();
                }
                return; //return, don't process to check the next step
            }
            //If deviceID return ERROR, device is corrupted, resolved object,
            //This scenarios will result statusCode -1503 on mac or -700 on windows
            //set back deviceID to -1, and isPrinterSupported to 0
            if (deviceID.toString().toLowerCase() === 'error' || statusCode === -1503 || statusCode === -700) {
                if (checkPrintControlHappy === false) {
                    deferredGetValues.resolveWith({
                        pluginInstance: null,
                        deviceId: -1,
                        isPrinterSupported: 0,
                        status: statusCode || -1503
                    });
                    return deferredGetValues.promise();
                } else {
                    //if we need need to check printControlHappy checked is required before promise obj is resolve,
                    //then we will need to need to retries again, wait for re-installed to be done.
                    retries = true;
                    if ((socket !== null) || (socket.readyState !== socket.CLOSED)) {
                        socket.close();
                    }
                    return; //Return right away, don't process to next step
                }
            }
            sendCheckPrinter();
        } else if (message.CheckPrinter !== undefined) {
            printerSupported = message.CheckPrinter;
            if (statusCode === null) {
                if (message.GetStatusCode !== undefined) {
                    statusCode = message.GetStatusCode;
                } else {
                    sendGetStatus();
                }
            }
        } else if (message.PrintCoupons !== undefined) {
            console.log("Start printing...");
            if (message.GetStatusCode !== undefined) {
                statusCode = message.GetStatusCode;
                deferredPrint.resolveWith({
                    status: statusCode,
                    manager: "socket"
                });
                //console.log("printing obj" + deferredPrint.state());
                return deferredPrint.promise();
            } else {
                printInProgress = true;
                sendGetStatus();
            }
        } else if (message.GetStatusCode !== undefined) {
            //Getting statusCode need to be checked last, to make sure that promise flow will not depend on statusCode checking
            statusCode = message.GetStatusCode;
            if (printInProgress === true) {
                printInProgress = false;
                deferredPrint.resolveWith({
                    status: statusCode,
                    manager: "socket"
                });
                return deferredPrint.promise();
            }
        } else {
            try {
                APP_COUPONSINC.log('Socket not return invalid message');
                socket.close();
            } catch (ex) {
                //Closing socket to making sure it's not hang
            }
        }

        checkCompleteMessage();
    }

    /**
     * Checks if all required values for Print workign are set
     * Values are : DeviceID, Status code and IsPrinterSupported
     * @return {@exp;deferredGetValues@call;promise}
     */

    function checkCompleteMessage() {
        //Check statusCode to satify socket requirements, if -500 < statusCode < -700 ==> Cannot write cids file to user temp,
        //in these case, socket is running, but we are not getting back the correct deviceID or printer supported,
        //therefore, fall back to plugin if statusCode in the range [-500, -700)
        if (deviceID !== null && printerSupported !== null && (statusCode !== null && (statusCode > -500 || statusCode < -700))) {
            // Log response and Close socket connection;
            console.log("Receive all msg, statusCode=" + statusCode);
            promiseObj = {
                deviceId: getDeviceID(),
                isPrinterSupported: isPrinterSupported(),
                status: getStatusCode()
            };
            deferredGetValues.resolveWith(promiseObj);
            //console.log(deferredGetValues.state());
            return deferredGetValues.promise();
        } else if (statusCode > -700 && statusCode < -500) { //in case checkMessage conditions fails
            console.log('Message not matching. Fallback to plugin');
            deferredGetValues.rejectWith({
                status: getStatusCode()
            });
            return deferredGetValues.promise();
        } //Else, don't resolve and just wait for response coming back
    }

    /**
     * Sends the getStatus command over the socket
     */

    function sendGetStatus() {
        socket.send(websocketModulePrefix + "method=GetStatusCode;input=Y|;separator=|");
    }

    /**
     * Sends the getDeviceID command over the socket
     */

    function sendGetDeviceID() {
        socket.send(websocketModulePrefix + "method=GetDeviceID;input=Y|;separator=|");
    }

    /**
     * Sends the Check printer supported command over the socket
     */

    function sendCheckPrinter() {
        socket.send(websocketModulePrefix + "method=CheckPrinter;input=Y|;separator=|");
    }

    /**
     * Send check version
     */

    function sendGetVersion() {
        socket.send(websocketModulePrefix + "method=GetVersion;input=Y|;separator=|");
    }

    /**
     * Parses the message recieved from CPS
     * Currently the CPS sends back NON standard Json that needs to be parsed.
     * In addition we need to trim last character.
     * @param {string} brokenJson String to be parsed
     * @return {JSON} format {command: FOO, data: BAR}
     */

    function parseMessage(brokenJson) {
        try {
            var parsedArray = $.parseJSON(brokenJson);
            return parsedArray;
        } catch (ex) {
            console.log("Parsing message from Socket failed" + ex.message);
            deferredGetValues.rejectWith({
                message: {
                    code: 'PARSE_ERROR',
                    message: 'Count not parse socket response'
                }
            });
            return deferredGetValues.promise();
        }
    }

    /**
     * Get the status code from the socket
     * @return {unresolved}
     */

    function getStatusCode() {
        //We will need to check for statuCode is numeric or not before change to int,
        //If statusCode is some error, just return it directly for error tracking
        if ($.isNumeric(statusCode)) {
            return parseInt(statusCode, 10);
        } else {
            return statusCode;
        }
    }

    /**
     * Returns the Device ID as obtained from the socket.
     * @return {unresolved}
     */

    function getDeviceID() {
        if ($.isNumeric(deviceID)) {
            return parseInt(deviceID, 10);
        } else {
            return deviceID;
        }
    }

    /**
     * Returns is the printer is supported
     * @return {Number, @exp;APPCOUPONSINC@pro;printcontrol@call;isPrinterSupported}
     */

    function isPrinterSupported() {
        return printerSupported === "true";
    }

    /**
     * Print the selected coupons via the websocket.
     * Returns a promise which is resolved when printing is completed.
     * @param  token The print token to be passed in.
     */

    function printCoupons(passedToken) {
        deferredPrint = $.Deferred();
        var zipcode = 99999, // should always be set, but if not, set to '99999'
            distributorID = '9z9z9', // not needed, but still needs to be passed
            cobrand = '0', // always 0
            token = 'DIRECT' + passedToken,
            personalization = '',
            printParamString = "Y|" + distributorID + "|" + cobrand + "|" + token + "|" + zipcode + '|' + personalization,
            printString = websocketModulePrefix + "method=PrintCoupons;input=" + printParamString + ";separator=|;InProgress=false";
        $.when(
            getPrintControlPromise()
        ).then(
            function() {
                socket.send(printString);
            },
            function() { //Fallback when socket connection failed, we are forced to use plugin & will follow plugin flow
                console.log("Fallback: plugin manager used");
                $.when(
                    COUPONSINC.printcontrol_plugin.printCoupons(passedToken)
                ).then(
                    function() {
                        deferredPrint.resolveWith({
                            status: this.status,
                            manager: "plugin"
                        });
                    }
                );
            }
        );

        return deferredPrint.promise();
    }

    /**
     * Returns a referece to the socket.
     * @return {WebSocket} Socket
     */

    function getSocket() {
        return socket;
    }

    return {
        getStatusCode: getStatusCode,
        getDeviceID: getDeviceID,
        isPrinterSupported: isPrinterSupported,
        printCoupons: printCoupons,
        getSocket: getSocket,
        getPrintControlPromise: getPrintControlPromise,
        getPrintControlVersion: getPrintControlVersion,
        isWebsocketConnectionReadyPromise: isWebsocketConnectionReadyPromise
    };
}(jQuery));

//Handling closing websocket when reloading the page, to prevent websocket corruption when the page is navigating away
jQuery(window).bind('beforeunload', function() {
    var socket = COUPONSINC.printcontrol_websocket.getSocket();
    try {
        if ((socket !== undefined) && (socket !== null) && (socket.readyState !== socket.CLOSED)) {
            socket.close();
        }
    } catch (ex) {
        //Silent catching error
    }
});
