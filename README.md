
## Event Bus WebRTC Helper for Vert.x 3.3.3

vertx3-eventbus-webrtc-helper

needed for: vertx3-eventbus-client-webrtc

Vert.x 3.3.3 javaScript

    var webRTCHelper = require( 'vertx3-eventbus-webrtc-helper' );

pass it the eventbus

    webRTCHelper.init( eb );
    
add bridge address options to inbound and outbound

        { "addressRegex" : "webrtc\\..+" }

a handle must be added to sockJSHandler for bridge events

    sockJSHandler.bridge( opts, webRTCHelper.bridgeEvent );