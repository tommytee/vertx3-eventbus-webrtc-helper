/* global module */

(function(){
  
  var registeredAddress = {};
  var clientsByPeerId = {};
  var registeredStatusAddress = {};
  var eb;

  module.exports.init = function ( ebus ) {

    eb = ebus;

    eb.consumer( 'webrtc.bridge' ).handler( function ( message ) {

      var msg = message.body();

      if ( msg.sendWithReply ) {

        //console.log('-=- helper -=- client outgoing send with reply started');
        sendingWithReply( message );

      } else if ( msg.register ) {

        //console.log('-=- helper -=- =- reg listener at address ' + msg.address + ' for client ' + msg.peerId )

        if ( registeredAddress[ msg.address ] ) {

          registeredAddress[ msg.address ].peerClients[ msg.peerId ] = true;

        } else {

          registeredAddress[ msg.address ] = {
            consumer: eb.consumer( msg.address ),
            peerClients: {}
          };

          registeredAddress[ msg.address ].peerClients[ msg.peerId ] = true;

          /**
           * <- * ->
           */
          registeredAddress[ msg.address ].consumer.handler(
            function ( msg4client ) {

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

                    //console.log('-=- helper -=- peerString from header: ' + peerString );

                    var thePeers = getPeerIds( peerString );

                    Object.keys( clients ).forEach( function ( peerId ) {

                      if ( thePeers[ peerId ] ) {

                        console.log('-=- helper -=- not forwarding to ' + peerId )

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

                    //console.log('-=- helper -=- forwarding to ' + peerId )

                    eb.send( 'webrtc.' + peerId, {
                      address: address,
                      body: body
                    }, {
                      headers: {}
                    } );

                  } );

                }
              }

            } );

        }

      } else if ( msg.unregister ) {

        console.log('-=- helper -=- UNREGISTER' );

        if ( registeredAddress[ msg.address ] ) {
          
          unregPeerFromAddress( msg.address, msg.peerId );
          
        } else {

          console.log(
            'Error unregister attempt for non-existing address ' +
            msg.address );
        }

      } else if ( msg.registerStatus ) {

        //console.log('-=- helper -=- -=-=-=-=-=--=- register Status' );

        if ( ! registeredStatusAddress[ msg.address ] ) {

          registeredStatusAddress[ msg.address ] = {};

        }

        registeredStatusAddress[ msg.address ][ msg.peerId ] = true;

      } else if ( msg.unregisterStatus ) {

        //console.log('-=- helper -=- -= unregister Status =-=--=-' );

        if ( ! registeredStatusAddress[ msg.address ] ) {

          registeredStatusAddress[ msg.address ] = {};

        }

        registeredStatusAddress[ msg.address ][ msg.peerId ] = true;

      }

    } )

  }

  module.exports.bridgeEvent = function( be ) {

    var peerId, msg, type = be.type();

    //console.log('--{-> '+ type +' -}> ' + JSON.stringify(be.getRawMessage()) );

    if ( type === 'UNREGISTER' ) {

      msg = be.getRawMessage();

      if ( msg.address.substr( 0, 7 ) === 'webrtc.' ) {

        peerId = msg.address.substr( 7 )

        //console.log('-=- helper -=- Peer left: ' + peerId );

        delete clientsByPeerId[ peerId ];

        // look through registered addresses for this peer id
        Object.keys( registeredAddress ).forEach( function ( address ) {

          if ( registeredAddress[ address ].peerClients[ peerId ] ) {

            unregPeerFromAddress( address, peerId );

            console.log('-=- helper -=- unregistered peer ' + peerId + ' from ' + address);
          }

        } );

      }

    } else if ( type === 'REGISTER' ) {

      msg = be.getRawMessage();

      if ( msg.address.substr( 0, 7 ) === 'webrtc.' ) {

        //console.log('-=- helper -=- Peer joined: ' + msg.address.substr( 7 ) );

        clientsByPeerId[ msg.peerId ] = true;

      }

    }

    be.complete( true );

  }

  function forward ( peerId, fromPeerId, address, body ) {

    //console.log('-=- helper -=- forwarding to ' + peerId )

    var envelope = {
      address: address,
      body: body
    };

    eb.send( 'webrtc.' + peerId, envelope,{headers:{"peerId":fromPeerId }});
  }

  function unregPeerFromAddress ( address, peerId ) {

    if ( registeredAddress[ address ].peerClients[ peerId ] ) {

      delete registeredAddress[ address ].peerClients[ peerId ];

      sendStatusUpdate( address, peerId );

      // if no clients left unregister
      if ( Object.keys(
          registeredAddress[ address ].peerClients ).length === 0 ) {

        registeredAddress[ address ].consumer.unregister();

        delete registeredAddress[ address ];

      }

    } else {

      console.log('-=- helper -=- Error unregister attempt for non-existing client '
        + peerId + ' on address ' + address );
    }
    
  }

  function sendStatusUpdate( address, fromPeerId ) {

    console.log('-=- helper -=- sendStatusUpdate',address);
    //console.log( JSON.stringify( registeredStatusAddress ));

    if ( registeredStatusAddress[ address ] ) {

      var peers = registeredStatusAddress[ address ];

      Object.keys( peers ).forEach(function ( peerId ) {

        eb.send( 'webrtc.' + peerId, {
          status: { listenerRemoved: true },
          address: address
        }, {
          headers: {}
        } );

        console.log('-=- helper -=- sent status of ' + address + ' to ' + peerId );

      })

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

  function onReply( mes1, err1, message ) {

    if ( err1 ) {

      console.log('-=- helper -=- error', err1.message );

    } else if ( mes1.replyAddress() ){

      //console.log('-=- helper -=- replyAddress:' + mes1.replyAddress() );

      message.reply( mes1.body(), function ( mes2, err2 ) {

        onReply( mes2, err2, mes1);

      })

    } else {

      //console.log('-=- helper -=- no replyAddress' );

      message.reply( mes1.body() );
    }

  }

  function replyDealer ( msg4client ) {

    var address = msg4client.address();

    var peerId = Object.keys( registeredAddress[ address ].peerClients )[0];

    var envelope = {
      address: address,
      body: msg4client.body()
    };

    eb.send( 'webrtc.' + peerId, envelope, function ( replyFromInternal, error ) {

      onReply( replyFromInternal, error, msg4client );

    })

  }
  
})()
