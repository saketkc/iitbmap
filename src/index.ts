export {
  CAMPUS_SOURCE_ID,
  ATTRIBUTION,
  campusLayers,
  getCampusStyle,
  mergeCampusLayers,
  setCampusTheme,
  type CampusStyleOptions,
  type MergeCampusLayersOptions,
} from "./style";

export { CAMPUS_BOUNDS, CAMPUS_CENTER, CAMPUS_BBOX, MIN_ZOOM, MAX_ZOOM, MAP_BG, MAP_BG_DARK, inCampusBbox } from "./geo";

export {
  IITB_BUILDINGS,
  BUILDINGS_SOURCE_ID,
  BUILDING_LABEL_LAYER_ID,
  buildingLabelLayer,
  setBuildingLabelsVisible,
  buildingCentroid,
} from "./buildings";

export { findRoute, findRoutes, type RoutingProfile, type Route } from "./routing";
