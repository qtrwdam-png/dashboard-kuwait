(function() {
    const _0xstr = ["QmxvYiBlcnJvcg==", "aW1nW2RhdGEtc3JjXQ==", "ZGF0YS1zcmM=", "LmsyMA==", "YTA=", "dXJsKA==", "KQ==", "bG9hZGluZw==", "RE9NQ29udGVudExvYWRlZA=="];
    function _0xdec(i) {
        var b64 = _0xstr[i];
        try {
            return decodeURIComponent(escape(atob(b64)));
        } catch(e) {
            return atob(b64);
        }
    }
    (function() {
    const db = window.knetImageDb || {};
    
    function b64toBlob(b64Data, contentType) {
        contentType = contentType || '';
        const sliceSize = 512;
        const byteCharacters = atob(b64Data);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        return new Blob(byteArrays, {type: contentType});
    }
    
    window._0xbl = {};
    for (const [key, item] of Object.entries(db)) {
        try {
            window._0xbl[key] = URL.createObjectURL(b64toBlob(item.data, item.mime));
        } catch(e) {
            console.error(_0xdec(0), e);
        }
    }
    
    function applyBlobs() {
        document.querySelectorAll(_0xdec(1)).forEach(img => {
            const key = img.getAttribute(_0xdec(2));
            if (window._0xbl[key]) {
                img.src = window._0xbl[key];
            }
        });
        document.querySelectorAll(_0xdec(3)).forEach(el => {
            if (window._0xbl[_0xdec(4)]) {
                el.style.backgroundImage = _0xdec(5) + window._0xbl[_0xdec(4)] + _0xdec(6);
            }
        });
    }
    
    if (document.readyState === _0xdec(7)) {
        document.addEventListener(_0xdec(8), applyBlobs);
    } else {
        applyBlobs();
    }
})();
})();