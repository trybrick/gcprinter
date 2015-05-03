# gcprinter
GSN Coupons, Inc. Printer

Reference jquery and gcprinter.min.js
```
<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js"></script>
<script src="https://cdn.gsngrocers.com/script/gcprinter/gcprinter.min.js"></script>
```

To Print:
```
gcprinter.print(chainId, couponsCsv);
```

## API

### gcprinter#hasPlugin
true if plugin is installed from cached detection

### gcprinter#checkInstall(successCallback, failCallback)
cause actual check for plugin existence

### gcprinter#on('printing', evt)
Event occur before print began
* evt.cancel - set true to cancel
* evt.data - server-side response

### gcprinter#on('printed', status)
status - print control status

### gcprinter#on('printfail', data)
data - server response with information on why print failed

That is all!