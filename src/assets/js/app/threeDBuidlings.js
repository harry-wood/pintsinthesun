define([
        'jquery',
        'underscore',
        'slider',
        'moment',
        'threejs',
        'd3',
        'mediator',
        'trackball',
        'suncalc'
    ], function($, _, Slider, moment, three, d3, Mediator, trackball, SunCalc) {

        var SUN_DISTANCE = 300;
        var CAMERA_DISTANCE = 100;
        var ZOOM = 15;

        function angles2cartesian(azimuth, altitude) {
            var x, y, z, radius, h;

            radius = SUN_DISTANCE;
            h = radius * Math.cos(altitude);
            y = h * Math.tan(altitude);
            x = h * Math.tan(azimuth) * -1;
            z = h * Math.cos(azimuth);

            return [x, y, z];
        }

        var ThreeDScene = function() {
            _.extend(this, Mediator);
            this.initScene();
            this.centre = [-0.0668529, 51.5127414]; // Central point as [lon, lat]
            this.subscribe('update', this.render);

            this.loadTextures();
            this.height = 20;
            this.extrudeSettings = {amount: this.height, bevelEnabled: false, material: 0,
                                    extrudeMaterial: 1};

            this.features = [];
        };

        ThreeDScene.prototype.loadTextures = function() {
            var self = this;

            this.pubMaterialRoof = new THREE.MeshLambertMaterial({color: 0x00ffdd});

            /**
             * Generates functions to put in the map callback for making textures
             */
            function generateTextureFn(prefix) {
                // Returns a function with prefix closed in
                return function(i) {
                    var tex = THREE.ImageUtils.loadTexture('assets/img/textures/' + prefix + i + '.jpg');
                    tex.anisotropy = 1;
                    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                    return new THREE.MeshLambertMaterial({map: tex});
                }
            }
            this.roofMaterials = _.range(1, 3).map(generateTextureFn('roof'));
            this.wallMaterials = _.range(1, 3).map(generateTextureFn('wall'));
        };

        ThreeDScene.prototype.setCentre = function setCentre(coords) {
            this.centre = coords;
            this.publish('update');
            return this;
        };

        // Set up the three.js scene. This is the most basic setup without
        // any special stuff
        ThreeDScene.prototype.initScene = function initScene() {
            var self = this;
            // set the scene size
            var WIDTH = $('.Modal-body').innerWidth(), HEIGHT = 600;

            // set some camera attributes
            var VIEW_ANGLE = 45,
                ASPECT = WIDTH / HEIGHT,
                NEAR = 0.1,
                FAR = 1000;

            // create a WebGL renderer, camera, and a scene
            this.renderer = new THREE.WebGLRenderer({antialias:true});
            this.camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
            this.scene = new THREE.Scene();

            // add and position the camera at a fixed position
            this.scene.add(this.camera);
            this.camera.position.z = CAMERA_DISTANCE;
            this.camera.position.x = 0;
            this.camera.position.y = CAMERA_DISTANCE;
            this.camera.lookAt(new THREE.Vector3(0, 0, 0));

            this.camera.rotation.x = 3*-Math.PI/2;

            // start the renderer, and black background
            this.renderer.setSize(WIDTH, HEIGHT);
            this.renderer.setClearColor(0x000);
            this.renderer.shadowMapEnabled = true;

            // add the render target to the page
            $("#ddd").append(this.renderer.domElement);

            this.letThereBeLight()
                .createFloor()
                .addHelpers()
                .updateSunPosition(window.currentMoment.toDate() || new Date());

            var light = new THREE.PointLight( 0xffffff, 1, 100 );
            light.position.set( 100, 300, -300 );
            this.scene.add( light );

            this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
            this.animate();
        };


        ThreeDScene.prototype.createFloor = function createFloor() {
            // add a base plane on which we'll render our map
            var planeGeo = new THREE.PlaneGeometry(300, 300, 10, 10);
            var texture = THREE.ImageUtils.loadTexture("assets/img/textures/tarmac.jpg");
            texture.anisotropy = 1;
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            var planeMat = new THREE.MeshLambertMaterial({map: texture});

            this.plane = new THREE.Mesh(planeGeo, planeMat);
            this.plane.side = THREE.DoubleSide;
            this.plane.receiveShadow = true;

            // rotate it to correct position
            this.plane.rotation.x = -Math.PI/2;
            this.scene.add(this.plane);
            return this;
        };


        ThreeDScene.prototype.letThereBeLight = function letThereBeLight() {
            var self = this;
            // add a light at a specific position
            this.sun = new THREE.SpotLight(0xFFFFFF);
            this.scene.add(this.sun);
            this.sun.castShadow = true;
            this.sun.shadowDarkness = 0.4;
            this.sun.shadowCameraVisible = true;

            this.subscribe('clock:change', function(m) {
                this.updateSunPosition(m.toDate());
            });

            return this;
        };

        ThreeDScene.prototype.addHelpers = function addHelpers() {
            var self = this;
            var axes = new THREE.AxisHelper(200);
            this.scene.add(axes);

            (function() {
                var southBox = new THREE.CubeGeometry(10, 10, 10);
                var cubeMat = new THREE.MeshPhongMaterial({color: 0xff0000});
                var cubeMesh = new THREE.Mesh(southBox, cubeMat);
                self.scene.add(cubeMesh);
                cubeMesh.position.x = 200;
                cubeMesh.position.y = 0;
                cubeMesh.position.z = 0;
            }());

            (function() {
                var southBox = new THREE.CubeGeometry(10, 10, 10);
                var cubeMat = new THREE.MeshPhongMaterial({color: 0x00ff00});
                var cubeMesh = new THREE.Mesh(southBox, cubeMat);
                self.scene.add(cubeMesh);
                cubeMesh.position.x = 0;
                cubeMesh.position.y = 200;
                cubeMesh.position.z = 0;
            }());

            (function() {
                var southBox = new THREE.CubeGeometry(10, 10, 10);
                var cubeMat = new THREE.MeshPhongMaterial({color: 0x0000ff});
                var cubeMesh = new THREE.Mesh(southBox, cubeMat);
                self.scene.add(cubeMesh);
                cubeMesh.position.x = 0;
                cubeMesh.position.y = 0;
                cubeMesh.position.z = 200;
            }());
            return this;
        };


        ThreeDScene.prototype.animate = function render() {
            requestAnimationFrame(_.bind(this.animate, this));

            this.controls.update();
            this.camera.position.sub(this.controls.target);
            this.render();
        };

        ThreeDScene.prototype.render = function render() {
            //requestAnimationFrame(this.render);
            this.renderer.render(this.scene, this.camera);
            return this;
        };

        ThreeDScene.prototype.updateSunPosition = function updateSunPosition(date) {
            var dt = date || new Date();
            var centre = this.centre || [-0.0668529, 51.5127414];
            var pos = SunCalc.getPosition(dt, centre[1], centre[0]);
            var sun = angles2cartesian(pos.azimuth, pos.altitude);

            this.sun.position.x = sun[0];
            this.sun.position.y = sun[1];
            this.sun.position.z = sun[2];

            this.publish('update');

            return this;
        };

        ThreeDScene.prototype.renderBuilding = function(coords, levels, isPub) {
            // Make points (that are lat longs into pixel coordinates
            var points = _(coords).map(_.bind(this.convertProjection, this));
            var shape = new THREE.Shape();
            // Get random materials
            var materialRoof = this.roofMaterials[_.random(0, this.roofMaterials.length -1)];
            var materialWall = this.wallMaterials[_.random(0, this.roofMaterials.length -1)];

            if(isPub) {
                materialRoof = this.pubMaterialRoof;
            }

            shape.moveTo(points[points.length-1][0], points[points.length-1][1]);

            // Add points to the shape
            _(points).each(function(xy) {
                shape.lineTo(xy[0], xy[1]);
            });

            this.extrudeSettings['amount'] = levels * 5;

            var materials = [materialRoof, materialWall];
            var geom = new THREE.ExtrudeGeometry(shape, this.extrudeSettings);
            var meshMaterial = new THREE.MeshFaceMaterial(materials);
            var mesh = new THREE.Mesh(geom, meshMaterial);

            geom.computeFaceNormals();

            mesh.rotation.x = -Math.PI/2;
            mesh.rotation.z = Math.PI/2;

            mesh.castShadow = true;
            mesh.receiveShadow = true;

            this.scene.add(mesh);
            this.features.push(mesh);
            this.publish('update');
            return this;
        };

        ThreeDScene.prototype.unload = function() {
            this.scene;
        };


        ThreeDScene.prototype.convertProjection = function(coords) {
            var tileSize = 128; // Pixel size of a single map tile
            var zoom = ZOOM || 14; // Zoom level
            var projection = d3.geo.mercator()
                .center(this.centre) // Geographic coordinates of map centre
                .translate([0, 0]) // Pixel coordinates of .center()
                .scale(tileSize << zoom); // Scaling value
            var pixelValue = projection(coords); // Returns [x, y]
            return [pixelValue[1] * -1, pixelValue[0] * -1];
        };

        return ThreeDScene;
});
