/**
 * ملف إيقاف الأصوات - Disable Sounds Script
 * 
 * الوظيفة: إيقاف جميع الأصوات التنبيهية في لوحة التحكم
 * الحفاظ على: التحديث التلقائي للبيانات من Firebase
 * 
 * تم إنشاؤه: 2026-06-21
 * الإصدار: 1.0
 */

// ============================================================================
// 1. إيقاف جميع الأصوات
// ============================================================================

// منع تشغيل أي صوت
const originalAudioPlayback = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function() {
    console.log('🔇 Sound blocked:', this.src);
    return Promise.resolve();
};

// منع إنشاء عناصر صوتية جديدة
const originalAudioConstructor = window.Audio;
window.Audio = function() {
    console.log('🔇 Audio element creation blocked');
    return {
        play: () => Promise.resolve(),
        pause: () => {},
        load: () => {}
    };
};

// ============================================================================
// 2. منع Web Audio API
// ============================================================================

if (window.AudioContext) {
    const originalAudioContext = window.AudioContext;
    window.AudioContext = function() {
        console.log('🔇 AudioContext blocked');
        return {
            createOscillator: () => ({}),
            createGain: () => ({ connect: () => {}, gain: { value: 0 } }),
            destination: {},
            resume: () => Promise.resolve()
        };
    };
}

// ============================================================================
// 3. منع مشغلات الأصوات الشائعة
// ============================================================================

// منع Howler.js
if (window.Howl) {
    window.Howl = function() {
        return {
            play: () => 1,
            pause: () => {},
            stop: () => {},
            mute: () => {},
            volume: () => 0
        };
    };
}

// منع Tone.js
if (window.Tone) {
    window.Tone.Synth = function() {
        return {
            triggerAttackRelease: () => {},
            dispose: () => {}
        };
    };
}

// ============================================================================
// 4. منع تشغيل الأصوات عبر fetch
// ============================================================================

const originalFetch = window.fetch;
window.fetch = function(url, options) {
    if (typeof url === 'string' && (url.includes('.mp3') || url.includes('.wav') || url.includes('.ogg'))) {
        console.log('🔇 Audio file fetch blocked:', url);
        return Promise.reject(new Error('Audio files are disabled'));
    }
    return originalFetch.apply(this, arguments);
};

// ============================================================================
// 5. منع XMLHttpRequest للأصوات
// ============================================================================

const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === 'string' && (url.includes('.mp3') || url.includes('.wav') || url.includes('.ogg'))) {
        console.log('🔇 Audio file XHR blocked:', url);
        return;
    }
    return originalOpen.apply(this, arguments);
};

// ============================================================================
// 6. إيقاف مشغلات الأصوات الشهيرة
// ============================================================================

// منع مشغل الأصوات العام
window.playSound = function() {
    console.log('🔇 playSound() called but blocked');
    return false;
};

window.playNotificationSound = function() {
    console.log('🔇 playNotificationSound() called but blocked');
    return false;
};

window.playAlert = function() {
    console.log('🔇 playAlert() called but blocked');
    return false;
};

// ============================================================================
// 7. إيقاف Notification API
// ============================================================================

if (window.Notification) {
    window.Notification.permission = 'denied';
    window.Notification = function() {
        return {
            close: () => {},
            onclick: null,
            onclose: null,
            onerror: null,
            onshow: null
        };
    };
}

// ============================================================================
// 8. تسجيل رسالة في Console
// ============================================================================

console.log('%c╔════════════════════════════════════════════════════════════╗', 'color: #00ff00; font-weight: bold;');
console.log('%c║  🔇 Sounds Disabled Successfully                          ║', 'color: #00ff00; font-weight: bold;');
console.log('%c║  All audio playback has been blocked                      ║', 'color: #00ff00;');
console.log('%c║  Real-time updates are still enabled                      ║', 'color: #00ff00;');
console.log('%c╚════════════════════════════════════════════════════════════╝', 'color: #00ff00; font-weight: bold;');

// ============================================================================
// 9. إضافة إعدادات مخصصة
// ============================================================================

window.DISABLE_SOUNDS = true;
window.SOUNDS_STATUS = 'DISABLED';

// دالة للتحقق من حالة الأصوات
window.getSoundsStatus = function() {
    return {
        soundsDisabled: window.DISABLE_SOUNDS,
        status: window.SOUNDS_STATUS,
        timestamp: new Date().toISOString()
    };
};

// دالة لإعادة تفعيل الأصوات (اختياري)
window.enableSounds = function() {
    console.warn('⚠️ Sounds are still disabled by system');
    return false;
};

console.log('✓ Sounds disabled script loaded successfully');
