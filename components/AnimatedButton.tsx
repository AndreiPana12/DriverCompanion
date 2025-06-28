import React, { useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface AnimatedButtonProps {
  onPress: () => void;
  text: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const AnimatedButton = ({
  onPress,
  text,
  style,
  textStyle,
  disabled,
}: AnimatedButtonProps) => {
  const strokeDashoffset = useSharedValue(0);

  const pathLength = 688; 
  const dashLength = 100;
  const gapLength = pathLength - dashLength;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: strokeDashoffset.value,
  }));

  useEffect(() => {
    strokeDashoffset.value = withRepeat(
      withTiming(-pathLength, {
        duration: 3500,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, []);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.buttonContainer, style]}
      activeOpacity={0.8}
    >
      <Text style={[styles.buttonText, textStyle]}>{text}</Text>

      <Svg
        style={StyleSheet.absoluteFill}
        viewBox="0 0 300 56"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <Stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <AnimatedPath
          d="M12 0 H288 A12 12 0 0 1 300 12 V44 A12 12 0 0 1 288 56 H12 A12 12 0 0 1 0 44 V12 A12 12 0 0 1 12 0 Z"
          stroke="url(#grad)"
          strokeWidth={2}
          fill="none"
          strokeDasharray={`${dashLength} ${gapLength}`}
          animatedProps={animatedProps}
        />
      </Svg>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    height: 56,
    width: 370,
    borderRadius: 12,
    backgroundColor: '#3A0CA3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    zIndex: 1,
  },
});

export default AnimatedButton;
