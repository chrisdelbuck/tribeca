'use strict';

angular.module('clientApp')
  .controller('ThegameCtrl', function ($scope) {

    $(document.body).addClass('thegame');

    var start_point, end_point, lookat_point;

    var map, directions_service, streetview_service;
    var ready = false, timeout = 1000 / 12, progress = 0;

    var timeStart = new Date().getTime()/1000;
    var timeNow = new Date().getTime()/1000;
    var timeToDie = 60;

    function getLocation() {
      navigator.geolocation.getCurrentPosition( getDestination, alert );
    }

    function getDestination(position) {
      start_point = new google.maps.LatLng( position.coords.latitude, position.coords.longitude );
      map = new google.maps.Map(document.createElement("div"), {
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        center: start_point,
        zoom: 13
      });

      var searchRequest = {
        location: start_point,
        //radius: 10000,
        types: ['funeral_home', 'cemetery'],
        rankBy: google.maps.places.RankBy.DISTANCE
      };
      var service = new google.maps.places.PlacesService(map);
      service.nearbySearch(searchRequest, getRoute);
      // service.textSearch(searchRequest, getRoute);
    }

    function getRoute( results, status ) {
      if (status == google.maps.places.PlacesServiceStatus.OK) {
        end_point = results[0].geometry.location;
        initHyperlapse();
      } else {
        alert("can't find route");
      }
    }

    function initHyperlapse() {

      directions_service = new google.maps.DirectionsService();

      var lutTexture = THREE.ImageUtils.loadTexture( "images/LUT1.png" );
      lutTexture.magFilter = THREE.NearestFilter;
      lutTexture.minFilter = THREE.NearestFilter;
      lutTexture.m
      var uniforms = {
          map: { type: "t", value: null },
          LUT: { type: "t", value: lutTexture },
          progress: { type: "f", value: null},
          lightness: { type: "f", value: 0},
          darkness: { type: "f", value: 0},
          time: { type: "f", value: 0}
      };

      var material = material = new THREE.ShaderMaterial( {

          uniforms: uniforms,
          vertexShader: document.getElementById( 'vertexShader' ).textContent,
          fragmentShader: document.getElementById( 'fragmentShader' ).textContent

        } );

      /* Hyperlapse */

      var pano = document.getElementById('pano');
      var is_moving = false;
      var px, py;
      var onPointerDownPointerX = 0, onPointerDownPointerY = 0;
      var offset = { x: 0, y: 0 };

      var hyperlapse = new Hyperlapse(pano, {
        lookat: lookat_point,
        fov: 100,
        millis: 50,
        width: window.innerWidth,
        height: window.innerHeight,
        zoom: 2,
        use_lookat: false,
        distance_between_points: 2,
        max_points: 100,
        material: material
      });
      
      hyperlapse.onError = function(e) {
        console.log( "ERROR: "+ e.message );
      };

      hyperlapse.onRouteComplete = function(e) {
        hyperlapse.load();
      };

      hyperlapse.onLoadComplete = function(e) {
        ready = true;
        timeStart = new Date().getTime() / 1000;
        $('#lobby').fadeOut(5000);
        console.log('hyperlapse ready');
      };

      hyperlapse.onFrame = function(e) {
        progress = (e.position+1)/hyperlapse.length();
        material.uniforms.progress.value = progress;
        material.uniforms.lightness.value = progress/2;
      };

      hyperlapse.onAnimate = function() {
        timeNow = new Date().getTime()/1000;
        material.uniforms.time.value = timeNow - timeStart;
        var dark = (timeNow - timeStart)/timeToDie;
        material.uniforms.darkness.value = Math.pow(dark,(1+progress*2));
      };

      pano.addEventListener('mousemove', function(e){
      
        if (!ready) {
          return;
        }

        var f = hyperlapse.fov() / 500;
        var dx = (e.webkitMovementX) * f;
        var dy = (e.webkitMovementY) * f;

        var px = (e.clientX / window.innerWidth) - 0.5;
        var py = (e.clientY / window.innerHeight) - 0.5;
        hyperlapse.position.x = px * 360;
        hyperlapse.position.y = - py * 90;
      
      });

      var cancelTimer = true;

      pano.addEventListener('mousedown', function(e) {

        if (!ready) {
          return;
        }

        var abs = Math.abs(hyperlapse.position.x);
        var isForward = abs < 45;
        var isBackward = abs > 90;

        if (isForward || isBackward) {
          cancelTimer = false;
          run(isForward);
        }

      });

      pano.addEventListener('mouseup', function(e) {

        cancelTimer = true;

      });

      function run(forward) {

        if (!ready) {
          return;
        }

        if (forward) {
          hyperlapse.next();
        } else {
          hyperlapse.prev();
        }

        if (!cancelTimer) {
          _.delay(run, timeout, forward);
        }

      }

      var bobHeight = 20;
      var inc = 0;

      function loop() {

        if (cancelTimer && hyperlapse.camera) {
          // Bob the camera like panting
          var cy = hyperlapse.camera.position.y;
          hyperlapse.camera.position.y = Math.sin(inc) * bobHeight;
          // hyperlapse.camera.position.z = Math.sin(inc) * bobHeight / 2;
          inc += 0.04;
        }

        requestAnimationFrame(loop);

      }

      loop();

      var gui = new dat.GUI();

      var o = {
        tilt:0, 
        position_x:0,
        position_y:0,
        screen_width: window.innerWidth,
        screen_height: window.innerHeight,
        lightness: 0,
        darkness: 0,
        generate:function(){
          var request = {
            origin: start_point, 
            destination: end_point, 
            travelMode: google.maps.DirectionsTravelMode.DRIVING
          };

          directions_service.route(request, function(response, status) {
            if (status == google.maps.DirectionsStatus.OK) {   
              hyperlapse.generate({route: response});
            } else {
              console.log(status);
            }
          })
        },
      };

      var parameters = gui.addFolder('parameters');

      var position_x_control = parameters.add(o, 'position_x', -360, 360).listen();
      position_x_control.onChange(function(value) {
        hyperlapse.position.x = value;
      });

      var position_y_control = parameters.add(o, 'position_y', -180, 180).listen();
      position_y_control.onChange(function(value) {
        hyperlapse.position.y = value;
      });

      var tilt_control = parameters.add(o, 'tilt', -Math.PI, Math.PI);
      tilt_control.onChange(function(value) {
        hyperlapse.tilt = value;
      });


      var lightness_control = parameters.add(o, 'lightness', 0, 2);
      lightness_control.onChange(function(value) {
        material.uniforms.lightness.value = value;
      });

      var darkness_control = parameters.add(o, 'darkness', 0, 2);
      darkness_control.onChange(function(value) {
        material.uniforms.darkness.value = value;
      });

      // parameters.open();
      
      var play_controls = gui.addFolder('play controls');
      play_controls.add(hyperlapse, 'play');
      play_controls.add(hyperlapse, 'pause');
      play_controls.add(hyperlapse, 'next');
      play_controls.add(hyperlapse, 'prev');
      play_controls.open();

      // gui.hide();
      // gui.domElement.style.display = 'none';

      window.addEventListener('resize', function(){
        hyperlapse.setSize(window.innerWidth, window.innerHeight);
        o.screen_width = window.innerWidth;
        o.screen_height = window.innerHeight;
      }, false);

      document.addEventListener( 'keydown', onKeyDown, false );
      function onKeyDown ( event ) {

        switch( event.keyCode ) {
          case 190: /* > */
            hyperlapse.next();
            break;

          case 188: /* < */
            hyperlapse.prev();
            break;
        }

      };

      o.generate();
    }

    getLocation();

  });
