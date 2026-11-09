import { useLayoutEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

type SlidingNumberProps = {
  value: number;
  text: string;
  style: StyleProp<TextStyle>;
};

type Transition = {
  previousText: string;
  direction: -1 | 1;
};

export function SlidingNumber({ value, text, style }: SlidingNumberProps) {
  const [progress] = useState(() => new Animated.Value(1));
  const previous = useRef({ value, text });
  const [transition, setTransition] = useState<Transition | null>(null);
  const flattenedStyle = StyleSheet.flatten(style);
  const lineHeight = flattenedStyle?.lineHeight ?? (flattenedStyle?.fontSize ?? 14) * 1.3;
  const { marginTop, marginBottom, marginVertical, ...characterStyle } = flattenedStyle ?? {};

  useLayoutEffect(() => {
    if (previous.current.text === text) {
      previous.current = { value, text };
      return;
    }

    const direction = value > previous.current.value ? -1 : 1;
    const previousText = previous.current.text;
    previous.current = { value, text };
    progress.stopAnimation();
    progress.setValue(0);
    setTransition({ previousText, direction });

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setTransition(null);
    });

    return () => animation.stop();
  }, [progress, text, value]);

  const currentDigits = [...text].filter((character) => /\d/.test(character));
  const previousDigits = transition
    ? [...transition.previousText].filter((character) => /\d/.test(character))
    : [];
  let digitPosition = 0;

  return (
    <View
      style={[
        styles.row,
        { height: lineHeight, marginTop, marginBottom, marginVertical },
      ]}
      accessible
      accessibilityLabel={text}
    >
      {[...text].map((character, index) => {
        if (!/\d/.test(character)) {
          return (
            <Text key={`text-${index}`} style={[characterStyle, styles.character]} accessible={false}>
              {character}
            </Text>
          );
        }

        const digitIndexFromRight = currentDigits.length - digitPosition - 1;
        const previousDigit = previousDigits[previousDigits.length - digitIndexFromRight - 1];
        digitPosition += 1;

        if (!transition || previousDigit === character) {
          return (
            <Text key={`digit-${digitIndexFromRight}`} style={[characterStyle, styles.character]} accessible={false}>
              {character}
            </Text>
          );
        }

        const previousTranslateY = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, transition.direction * lineHeight],
        });
        const nextTranslateY = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-transition.direction * lineHeight, 0],
        });

        return (
          <View key={`digit-${digitIndexFromRight}`} style={[styles.digitViewport, { height: lineHeight }]}>
            <Text style={[characterStyle, styles.measure]} accessible={false}>{character}</Text>
            {previousDigit ? (
              <Animated.Text
                accessible={false}
                style={[
                  characterStyle,
                  styles.layer,
                  { transform: [{ translateY: previousTranslateY }] },
                ]}
              >
                {previousDigit}
              </Animated.Text>
            ) : null}
            <Animated.Text
              accessible={false}
              style={[
                characterStyle,
                styles.layer,
                { transform: [{ translateY: nextTranslateY }] },
              ]}
            >
              {character}
            </Animated.Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  character: { flexShrink: 0 },
  digitViewport: { position: 'relative', overflow: 'hidden', flexShrink: 0 },
  measure: { opacity: 0 },
  layer: { position: 'absolute', left: 0, top: 0 },
});
