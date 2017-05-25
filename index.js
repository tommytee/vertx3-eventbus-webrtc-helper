/* global module */

(function() {

  var registeredAddress = {};
  var clientsByPeerId = {};
  var registeredStatusAddress = {};
  var eb, logger = Java.type( "io.vertx.core.logging.LoggerFactory" ).getLogger( 'vertx3-eventbus-webrtc-helper' );

  function bridgeEvent( be ) {

    var peerId, msg, type = be.type();

    //logger.info('--{-> '+ type +' -}> ' + JSON.stringify(be.getRawMessage()) );

    if ( type === 'UNREGISTER' ) {

      msg = be.getRawMessage();

      if ( msg.address.substr( 0, 7 ) === 'webrtc.' ) {

        peerId = msg.address.substr( 7 )

        logger.info('Peer left: ' + peerId );

        delete clientsByPeerId[ peerId ];

        // look through registered addresses for this peer id

        Object.keys( registeredAddress ).forEach( function ( address ) {

          if ( registeredAddress[ address ].peerClients[ peerId ] ) {

            unregPeerFromAddress( address, peerId );

          }

        } );

        // look through registered status addresses for this peer id

        Object.keys( registeredStatusAddress ).forEach( function ( address ) {

          if ( registeredStatusAddress[ address ][ peerId ] ) {

            unregPeerFromStatusAddress( address, peerId );

          }

        } );

      }

    } else if ( type === 'REGISTER' ) {

      msg = be.getRawMessage();

      if ( msg.address.substr( 0, 7 ) === 'webrtc.' ) {

        clientsByPeerId[ msg.peerId ] = true;

      }

    }

    be.complete( true );

  }
  
  function helperMessage( message ) {

    var msg = message.body();

    if ( msg.sendWithReply ) {

      sendingWithReply( message );

    } else if ( msg.register ) {

      if ( ! registeredAddress[ msg.address ] ) {

        registeredAddress[ msg.address ] = { consumer: eb.consumer( msg.address ), peerClients: {} };
        registeredAddress[ msg.address ].consumer.handler( addressHandler );

      }

      registeredAddress[ msg.address ].peerClients[ msg.peerId ] = true;

      statusHandlerCheck( msg.address, 'register' );

    } else if ( msg.unregister ) {

      if ( registeredAddress[ msg.address ] ) {

        unregPeerFromAddress( msg.address, msg.peerId );

      } else {

        logger.error( 'Error unregister attempt for non-existing address ' + msg.address );

      }

    } else if ( msg.registerStatus ) {

      logger.info('register status for address ' + msg.address );

      if ( ! registeredStatusAddress[ msg.address ] ) {

        registeredStatusAddress[ msg.address ] = {};

      }

      registeredStatusAddress[ msg.address ][ msg.peerId ] = true;

    } else if ( msg.unregisterStatus ) {

      if ( registeredStatusAddress[ msg.address ] ) {

        unregPeerFromStatusAddress( msg.address, msg.peerId )

      }

    }

  }

  function addressHandler ( msg4client ) {

    var body = msg4client.body();
    var address = msg4client.address();
    var replyAddress = msg4client.replyAddress();
    var fromPeerId = msg4client.headers().get( "peerId" );
    var peerString = msg4client.headers().get( "peers" );
    var clients = registeredAddress[ address ].peerClients;

    if ( replyAddress ) {

      replyDealer( msg4client );

    } else {

      if ( fromPeerId ) {

        if ( peerString ) {

          var thePeers = getPeerIds( peerString );

          Object.keys( clients ).forEach( function ( peerId ) {

            if ( thePeers[ peerId ] ) {

              logger.info( 'not forwarding to ' + peerId );

            } else {

              forward( peerId, fromPeerId, address, body );

            }

          } );

        } else {

          Object.keys( clients ).forEach( function ( peerId ) {

            forward( peerId, fromPeerId, address, body );

          } );

        }

      } else {

        Object.keys( clients ).forEach( function ( peerId ) {

          eb.send( 'webrtc.' + peerId, { address: address, body: body }, { headers: {} } );

        } );

      }

    }

  }
  
  function forward ( peerId, fromPeerId, address, body ) {

    var envelope = {
      address: address,
      body: body
    };

    eb.send( 'webrtc.' + peerId, envelope, { headers: { "peerId": fromPeerId } } );

  }

  function unregPeerFromAddress ( address, peerId ) {

    if ( registeredAddress[ address ].peerClients[ peerId ] ) {

      delete registeredAddress[ address ].peerClients[ peerId ];

      logger.info( 'unregistered peer ' + peerId + ' from ' + address );

      statusUpdateListenerRemoved( address, peerId );

      // if no clients left unregister

      if ( Object.keys( registeredAddress[ address ].peerClients ).length === 0 ) {

        registeredAddress[ address ].consumer.unregister();

        delete registeredAddress[ address ];

      }

    } else {

      logger.error( 'Error unregister attempt for non-existing client ' + peerId + ' on address ' + address );

    }

  }

  function unregPeerFromStatusAddress ( address, peerId ) {

    if ( registeredStatusAddress[ address ][ peerId ] ) {

      delete registeredStatusAddress[ address ][ peerId ];

      logger.info('unregister status for address ' + address + ', peer: ' + peerId );

      // if no clients left delete registeredStatusAddress

      if ( Object.keys( registeredStatusAddress[ address ] ).length === 0 ) {

        delete registeredStatusAddress[ address ];

      }

    } else {

      logger.error( 'Error unregister status attempt for non-existing client ' + peerId + ' on address ' + address );

    }

  }

  function statusHandlerCheck ( address, type ) {

    if ( registeredStatusAddress[ address ] ) {

      var peers = registeredStatusAddress[ address ];
      var peArr = Object.keys( peers );

      peArr.forEach( function ( peerId ) {

        eb.send( 'webrtc.' + peerId, { status: { type:type, total:peArr.length }, address:address }, { headers:{} } );

        logger.info( 'sent status type ' + type + ' for ' + address + ' to ' + peerId );

      } )

    }

  }

  function statusUpdateListenerRemoved ( address, fromPeerId ) {

    //logger.info( 'statusUpdateListenerRemoved ' + address );

    if ( registeredStatusAddress[ address ] ) {

      var peers = registeredStatusAddress[ address ];

      Object.keys( peers ).forEach( function ( peerId ) {

        eb.send( 'webrtc.' + peerId, { status: { listenerRemoved: true }, address: address }, { headers: {} } );

        logger.info( 'sent status of ' + address + ' to ' + peerId );

      } )

      delete registeredStatusAddress[ address ]

    }

  }

  function getPeerIds ( string ) {

    var peers = {};

    for ( var i = 0; i < string.length; i += 16 ) {

      peers[ string.substr( i, 16 ) ] = true;

    }

    return peers

  }

  function sendingWithReply ( message ) {

    var msg = message.body();

    eb.send( msg.envelope.address, msg.envelope.body, function ( reply, error ) {

      onReply( reply, error, message );

    } )

  }

  function onReply ( mes1, err1, message ) {

    if ( err1 ) {

      logger.error( err1.message );

    } else if ( mes1.replyAddress() ) {

      message.reply( mes1.body(), function ( mes2, err2 ) {

        onReply( mes2, err2, mes1 );

      } )

    } else {

      message.reply( mes1.body() );

    }

  }

  function replyDealer ( msg4client ) {

    var address = msg4client.address();
    var peerId = Object.keys( registeredAddress[ address ].peerClients )[ 0 ];
    var envelope = {
      address: address,
      body: msg4client.body()
    };

    eb.send( 'webrtc.' + peerId, envelope, function ( replyFromInternal, error ) {

      onReply( replyFromInternal, error, msg4client );

    } )

  }

  module.exports.bridgeEvent = bridgeEvent;
  
  module.exports.init = function ( ebus ) {
    eb = ebus;
    eb.consumer( 'webrtc.bridge' ).handler( helperMessage );
  }

})()
