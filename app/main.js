define(["require", "exports", "esri/WebMap", "esri/core/urlUtils", "esri/views/MapView", "esri/tasks/support/Query", "esri/core/watchUtils", "esri/core/requireUtils", "esri/core/promiseUtils", "esri/Graphic", "esri/Color", "esri/geometry/Extent", "esri/symbols/SimpleFillSymbol", "esri/symbols/SimpleLineSymbol", "esri/widgets/Search", "esri/widgets/Home"], function (require, exports, WebMap, urlUtils, MapView, Query, watchUtils, requireUtils, promiseUtils, Graphic, Color, Extent, SimpleFillSymbol, SimpleLineSymbol, Search, Home) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    var watchHandler;
    var keyDownHandler;
    var keyUpHandler;
    var queryLayers = [];
    var displayField;
    var webmapId = "7eca81856e22478da183da6a33c24dfe";
    var queryResults;
    var pageResults;
    var currentPage;
    var numberOfPages;
    var extent = null;
    var liveNode = document.getElementById("liveViewInfo");
    var liveDirNode = document.getElementById("dir");
    var liveDetailsNode = document.getElementById("details");
    var numberPerPage = 7;
    var enableDirections = false;
    var urlObject = urlUtils.urlToObject(document.location.href);
    if (urlObject && urlObject.query) {
        if (urlObject.query.webmap) {
            webmapId = urlObject.query.webmap;
        }
        if (urlObject.query.directions) {
            enableDirections = true;
        }
    }
    var map = new WebMap({
        portalItem: {
            id: webmapId
        }
    });
    var view = new MapView({
        map: map,
        container: "viewDiv"
    });
    // Add the live node to the view 
    view.ui.add(liveNode, "manual");
    // When user tabs into the app for the first time 
    // add button to navigate map via keyboard to the ui and focus it 
    document.addEventListener("keydown", function handler(e) {
        if (e.keyCode === 9) {
            e.currentTarget.removeEventListener(e.type, handler);
            var keyboardBtn_1 = document.getElementById("keyboard");
            keyboardBtn_1.classList.remove("hidden");
            view.ui.add({
                component: keyboardBtn_1,
                position: "top-left",
                index: 0
            });
            keyboardBtn_1.addEventListener("click", addFocusToMap);
            keyboardBtn_1.focus();
            keyboardBtn_1.addEventListener('blur', function blurHandler(e) {
                e.currentTarget.removeEventListener(e.type, blurHandler);
                keyboardBtn_1.focus();
            });
        }
    });
    var searchWidget = new Search({
        view: view,
        popupEnabled: true,
        popupOpenOnSelect: true,
        autoSelect: true
    });
    var homeWidget = new Home({
        view: view
    });
    view.ui.add({
        component: searchWidget,
        position: "top-left",
        index: 0
    });
    view.ui.add(homeWidget, "top-left");
    // Only search locally within the view extent 
    searchWidget.sources.getItemAt(0).withinViewEnabled = true;
    searchWidget.on("search-start", function () {
        watchUtils.once(view.popup, "title", function () {
            view.popup.focus();
            watchUtils.whenFalseOnce(view.popup, "visible", function () {
                addFocusToMap();
            });
        });
    });
    /**
     * Get the first layer in the map to use as the layer to query for features
     * that appear within the highlighted graphic
     */
    view.then(function () {
        extent = view.extent.clone();
        if (enableDirections) {
            generateDirections(view);
        }
        view.on("layerview-create", function (result) {
            if (result.layerView.layer.type === "feature") {
                var l = result.layer;
                if (l.popupEnabled) {
                    queryLayers.push(result.layerView);
                }
            } else if (result.layerView.layer.type === "map-image") {
                var mapImageLayer = result.layerView.layer;
                mapImageLayer.sublayers.forEach(function (layer) {
                    if (layer.popupTemplate) {
                        queryLayers.push(layer);
                    }
                });
            }
        });
    });

    function setupKeyHandlers() {
        if (!watchHandler) {
            watchHandler = watchUtils.pausable(view, "extent", function () {
                createGraphic(view);
            });
        } else {
            watchHandler.resume();
        }
        if (!keyUpHandler) {
            /**
             * Handle numeric nav keys
             */
            keyUpHandler = view.on("key-up", function (keyEvt) {
                var key = keyEvt.key;
                if (pageResults && pageResults.length && key <= pageResults.length) {
                    displayFeatureInfo(key);
                } else if (key === "8" && numberOfPages > 1 && currentPage > 1) {
                    currentPage -= 1;
                    generateList();
                } else if (key === "9" && numberOfPages > 1) {
                    currentPage += 1;
                    generateList();
                }
            });
        }
        if (!keyDownHandler) {
            /**
             * Handle info and dir keys
             */
            keyDownHandler = view.on("key-down", function (keyEvt) {
                var key = keyEvt.key;
                if (key === "i") {
                    // reverse geocode and display location information
                    var rectExt = view.graphics.getItemAt(0).geometry;
                    var loc = rectExt.center;
                    var worldLocator = searchWidget.sources.getItemAt(0);
                    worldLocator.locator.locationToAddress(loc, 1000).then(function (candidate) {
                        console.log("Attributes", JSON.stringify(candidate.attributes));
                        calculateLocation(candidate.attributes);
                    }, function (err) {
                        liveDirNode.innerHTML = "Unable to calculate location";
                    });
                } else if (key === "ArrowUp" || key === "ArrowDown" ||
                    key === "ArrowRight" || key === "ArrowLeft") {
                    var dir = void 0;
                    switch (key) {
                        case "ArrowUp":
                            dir = "north";
                            break;
                        case "ArrowDown":
                            dir = "south";
                            break;
                        case "ArrowRight":
                            dir = "east";
                            break;
                        case "ArrowLeft":
                            dir = "west";
                            break;
                    }
                    liveDirNode.innerHTML = "Moving " + dir + ".";
                } else if (key === "h") {
                    /// Go to the view's initial extent 
                    view.goTo(extent);
                }
            });
        }
    }
    /**
     * Clean up the highlight graphic and feature list if the map loses
     * focus and the popup isn't visible
     */
    function cleanUp() {
        if (view.popup.visible) {
            return;
        }
        view.blur();
        liveNode.classList.add("hidden");
        liveDetailsNode.innerHTML = null;
        liveDirNode.innerHTML = null;
        view.graphics.removeAll();
        watchHandler.pause();
        if (keyDownHandler) {
            keyDownHandler.remove();
            keyDownHandler = null;
        }
        if (keyUpHandler) {
            keyUpHandler.remove();
            keyUpHandler = null;
        }
    }
    /**
     *  Add a highlight graphic to the map and use it to navigate/query content
     * @param view
     */
    function createGraphic(view) {
        view.graphics.removeAll();
        view.popup.visible = false;
        var fillSymbol = new SimpleFillSymbol({
            color: new Color([0, 0, 0, 0.2]),
            outline: new SimpleLineSymbol({
                color: new Color([0, 0, 0, 0.8]),
                width: 1
            })
        });
        var centerPoint = view.center;
        var tolerance = view.scale / 60;
        var extent = new Extent({
            xmin: centerPoint.x - tolerance,
            ymin: centerPoint.y - tolerance,
            xmax: centerPoint.x + tolerance,
            ymax: centerPoint.y + tolerance,
            spatialReference: view.center.spatialReference
        });
        var graphic = new Graphic({
            geometry: extent,
            symbol: fillSymbol
        });
        view.graphics.add(graphic);
        if (queryLayers && queryLayers.length > 0) {
            queryFeatures(graphic);
        }
    }
    /**
     *  Query the feature layer to get the features within the highlighted area
     * currently setup for just the first layer in web map
     * @param queryGraphic Extent graphic used drawn on the map and used to select features
     */
    function queryFeatures(queryGraphic) {
        var query = new Query({
            geometry: queryGraphic.geometry
        });
        queryResults = [];
        pageResults = null;
        currentPage = 1;
        promiseUtils.eachAlways(queryLayers.map(function (layerView) {
            var flayer;
            if (layerView.layer.type && layerView.layer.type === "map-image") {
                query.returnGeometry = true;
                query.outFields = ["*"];
                flayer = layerView;
                return layerView.queryFeatures(query).then(function (queryResults) {
                    if (queryResults.features && queryResults.features.length && queryResults.features.length > 0) {
                        return queryResults.features;
                    }
                });
            } else {
                flayer = layerView;
                return layerView.queryFeatures(query).then(function (queryResults) {
                    return queryResults;
                });
            }
        })).then(function (results) {
            queryResults = [];
            results.forEach(function (result) {
                if (result && result.value) {
                    result.value.forEach(function (val) {
                        queryResults.push(val);
                    });
                }
            });
            numberOfPages = Math.ceil(queryResults.length / numberPerPage);
            liveDetailsNode.innerHTML = "";
            if (queryResults.length && queryResults.length > 21) {
                liveDetailsNode.innerHTML = queryResults.length + " results found in search area. Press the plus key to zoom in and reduce number of results.";
            } else {
                generateList();
            }
        });
    }

    function updateLiveInfo(displayResults, prev, next) {
        var updateContent;
        if (displayResults && displayResults.length > 0) {
            var updateValues = displayResults.map(function (graphic, index) {
                var titleTemplate = graphic.popupTemplate.title;
                // find curly brace values
                for (var key in graphic.attributes) {
                    if (graphic.attributes.hasOwnProperty(key)) {
                        titleTemplate = titleTemplate.replace(new RegExp('{' + key + '}', 'gi'), graphic.attributes[key]);
                    }
                }
                return "<span class=\"feature-label\"><span class=\"feature-index\">" + (index + 1) + "</span>  " + titleTemplate + "</span>";
            });
            if (next) {
                // add 9 to get more features
                updateValues.push("<span class=\"feature-label\"><span class=\"feature-index\">9</span>See more results</span>");
            }
            if (prev) {
                // add 8 to go back
                updateValues.push("<span class=\"feature-label\"><span class=\"feature-index\">8</span>View previous results</span>");
            }
            updateContent = updateValues.join(" ");
        } else {
            updateContent = "No features found";
        }
        liveDetailsNode.innerHTML = updateContent;
        liveNode.setAttribute("aria-busy", "false");
    }
    /**
     * Generate a page of content for the currently highlighted area
     */
    function generateList() {
        var begin = ((currentPage - 1) * numberPerPage);
        var end = begin + numberPerPage;
        pageResults = queryResults.slice(begin, end);
        // Get page status  
        var prevDisabled = currentPage === 1; // don't show 8
        var nextDisabled = currentPage === numberOfPages; // don't show 9
        liveNode.setAttribute("aria-busy", "true");
        updateLiveInfo(pageResults, !prevDisabled, !nextDisabled);
    }
    /**
     * Display popup for selected feature
     * @param key number key pressed to identify selected feature
     */
    function displayFeatureInfo(key) {
        var selectedGraphic = pageResults[key - 1];
        if (selectedGraphic) {
            var location_1;
            if (selectedGraphic.geometry.type === "point") {
                location_1 = selectedGraphic.geometry;
            } else if (selectedGraphic.geometry.extent && selectedGraphic.geometry.extent.center) {
                location_1 = selectedGraphic.geometry.extent.center;
            }
            view.popup.open({
                location: location_1,
                features: [selectedGraphic]
            });
            watchUtils.whenTrueOnce(view.popup, "visible", function () {
                view.popup.focus();
            });
            watchUtils.whenFalseOnce(view.popup, "visible", addFocusToMap);
        }
    }

    function addFocusToMap() {
        document.getElementById("intro").innerHTML = "Use the arrow keys to navigate the map and find features. Use the plus (+) key to zoom in to the map and the minus (-) key to zoom out.\n        For details on your current area press the i key. Press the h key to return to the  starting map location.";
        window.addEventListener("mousedown", function (keyEvt) {
            // Don't show the feature list unless tab is pressed. 
            // prevent default for text box so search works
            if (keyEvt.key !== "Tab") {
                if (keyEvt.target.type !== "text") {
                    keyEvt.preventDefault();
                    view.blur();
                }
            }
        });
        view.watch("focused", function () {
            if (view.focused) {
                liveNode.classList.remove("hidden");
                createGraphic(view);
                setupKeyHandlers();
            } else {
                cleanUp();
            }
        });
        1;
        view.focus();
    }

    function calculateLocation(address) {
        var displayValue;
        if (view.scale > 12000000) {
            displayValue = address.CountryCode || address.Subregion;
        } else if (view.scale > 3000000) {
            displayValue = address.Region || address.Subregion;
        } else if (view.scale > 160000) {
            displayValue = address.City || address.Region || address.Subregion;
        } else if (view.scale > 40000) {
            displayValue = address.Neighborhood || address.Address;
        } else {
            displayValue = address.Match_addr || address.Address;
        }
        liveDirNode.innerHTML = "Currently searching near " + displayValue;
    }

    function generateDirections(view) {
        // Once the JSAPI directons widget supports adding a pre-created location we'll pull this out and use the 
        // Directions widget instead
        requireUtils.when(require, [
            "esri/tasks/RouteTask",
            "esri/layers/GraphicsLayer",
            "esri/tasks/support/RouteParameters",
            "esri/tasks/support/FeatureSet",
            "esri/widgets/Expand",
            "esri/widgets/Search"
        ]).then(function (_a) {
            var RouteTask = _a[0],
                GraphicsLayer = _a[1],
                RouteParameters = _a[2],
                FeatureSet = _a[3],
                Expand = _a[4],
                Search = _a[5];
            var routeUrl = "https://utility.arcgis.com/usrsvcs/appservices/558KNZRaOjSBlsNN/rest/services/World/Route/NAServer/Route_World";
            var panel = document.createElement("div");
            panel.classList.add("panel");
            var directionsList = document.createElement("div");
            directionsList.id = "directionsList";
            var distanceDetails = document.createElement("div");
            distanceDetails.id = "distanceDetails";
            distanceDetails.classList.add("text-darker-gray", "driving-details", "text-rule", "text-darker-gray");
            directionsList.setAttribute("role", "alert");
            directionsList.classList.add("directions-list");
            directionsList.setAttribute("aria-atomic", "true");
            directionsList.setAttribute("aria-live", "polite");
            var searchContainer = document.createElement("div");
            var endSearchContainer = document.createElement("div");
            panel.appendChild(searchContainer);
            panel.appendChild(endSearchContainer);
            panel.appendChild(distanceDetails);
            panel.appendChild(directionsList);
            var expand = new Expand({
                view: view,
                content: panel,
                expandIconClass: "esri-icon-directions"
            });
            var routeLayer = new GraphicsLayer({
                id: "routes"
            });
            view.map.add(routeLayer);
            var routeParams = new RouteParameters({
                stops: new FeatureSet(),
                returnDirections: true,
                directionsOutputType: "complete"
            });
            var routeTask = new RouteTask({
                url: routeUrl
            });
            var startSearch = createSearch(searchContainer, "Enter start");
            var endSearch = createSearch(endSearchContainer, "Enter destination");
            var action = {
                title: "Directions",
                id: "directions",
                className: "esri-icon-directions"
            };
            view.popup.actions.push(action);
            view.popup.on("trigger-action", function (event) {
                if (event.action.id = "directions") {
                    routeLayer.removeAll();
                    var selFeature = view.popup.selectedFeature.clone();
                    view.popup.close();
                    view.ui.add(expand, "top-right");
                    expand.watch("expanded", function () {
                        if (expand.expanded) {
                            endSearch.focus();
                        } else {
                            view.focus();
                        }
                    });
                    expand.expand();
                    var location_2 = view.popup.location;
                    startSearch.searchTerm = location_2.x + ", " + location_2.y;
                    var endGraphic_1 = new Graphic({
                        geometry: location_2,
                        symbol: {
                            type: "simple-marker",
                            path: "M0-48c-9.8 0-17.7 7.8-17.7 17.4 0 15.5 17.7 30.6 17.7 30.6s17.7-15.4 17.7-30.6c0-9.6-7.9-17.4-17.7-17.4z",
                            color: "#00ff00",
                            outline: {
                                width: "1",
                                color: "#fff"
                            },
                            size: "26px"
                        }
                    });
                    routeLayer.add(endGraphic_1);
                    endSearch.on("search-complete", function (results) {
                        routeLayer.clear;
                        distanceDetails.innerHTML = "";
                        directionsList.innerHTML = "";
                        if (results.numResults > 0) {
                            var startGraphic = new Graphic({
                                geometry: results.results[0].results[0].feature.geometry,
                                symbol: {
                                    type: "simple-marker",
                                    path: "M0-48c-9.8 0-17.7 7.8-17.7 17.4 0 15.5 17.7 30.6 17.7 30.6s17.7-15.4 17.7-30.6c0-9.6-7.9-17.4-17.7-17.4z",
                                    color: "#0892d0",
                                    outline: {
                                        width: "1",
                                        color: "#fff"
                                    },
                                    size: "26px"
                                }
                            });
                            routeLayer.add(startGraphic);
                            routeParams.stops.features.push(startGraphic);
                            routeParams.stops.features.push(endGraphic_1);
                            routeTask.solve(routeParams).then(function (routeResult) {
                                var result = routeResult.routeResults[0];
                                var route = result.route;
                                route.symbol = {
                                    type: "simple-line",
                                    color: "#00b3fd",
                                    width: 4,
                                    outline: {
                                        color: "#fff",
                                        width: "1"
                                    },
                                    join: "bevel",
                                    cap: "round"
                                };
                                routeLayer.add(route);
                                distanceDetails.innerHTML = "Time: " + Math.round(result.directions.totalTime) + " Distance: " + Math.round(result.route.attributes.Total_Miles).toFixed(4) + " miles ";
                                var details = "<ol class=\"list-numbered directions-list\">\n                                " + result.directions.features.map(function (feature) {
                                    return "<li data-geometry=" + feature.geometry + ">" + feature.attributes.text + "</li>";
                                }).join("") + " \n                             </ol>";
                                directionsList.innerHTML = details;
                            });
                        }
                    });
                }
            });
        });
    }

    function createSearch(node, placeholder) {
        var search = new Search({
            view: view,
            popupEnabled: false,
            popupOpenOnSelect: false,
            autoSelect: false,
            container: node
        });
        search.on("search-clear", function () {
            var layer = view.map.findLayerById("routes");
            layer.removeAll();
            document.getElementById("distanceDetails").innerHTML = "";
            document.getElementById("directionsList").innerHTML = "";
        });
        var source = search.sources;
        var locator = source.items[0];
        locator.placeholder = placeholder;
        locator.filter = {
            where: null,
            geometry: view.extent
        };
        return search;
    }
});
//# sourceMappingURL=main.js.map