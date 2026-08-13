import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import { colors } from '../../theme/theme';

interface TableSurfaceProps {
  width: number;
  height: number;
}

const RAIL_THICKNESS = 16;

export function TableSurface({ width, height }: TableSurfaceProps) {
  if (width <= 0 || height <= 0) return null;
  const cx = width / 2;
  const cy = height / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Ellipse cx={cx} cy={cy} rx={width / 2} ry={height / 2} fill={colors.tableRail} />
        <Ellipse
          cx={cx}
          cy={cy}
          rx={width / 2 - RAIL_THICKNESS}
          ry={height / 2 - RAIL_THICKNESS}
          fill={colors.tableFelt}
        />
      </Svg>
      <View style={[styles.watermarkWrap, { top: cy - 40 }]}>
        <Text style={styles.watermarkSpade}>♠</Text>
        <Text style={styles.watermarkLabel}>pokza</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  watermarkWrap: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    opacity: 0.05,
  },
  watermarkSpade: {
    fontSize: 64,
    lineHeight: 64,
    color: '#FFFFFF',
  },
  watermarkLabel: {
    fontSize: 14,
    letterSpacing: 2,
    color: '#FFFFFF',
    marginTop: -4,
  },
});
