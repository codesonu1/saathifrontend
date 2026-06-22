import React from 'react';
import { View, Text } from 'react-native';

const MapView = ({ children, style }) => {
  return (
    <View style={[{ backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' }, style]}>
      <Text style={{ color: '#555', fontWeight: 'bold' }}>Map View Stub (Not supported on Web)</Text>
      {children}
    </View>
  );
};

export const Marker = ({ children, style }) => {
  return (
    <View style={style}>
      {children}
    </View>
  );
};

export const Polyline = () => {
  return null;
};

export const PROVIDER_GOOGLE = 'google';

export default MapView;
