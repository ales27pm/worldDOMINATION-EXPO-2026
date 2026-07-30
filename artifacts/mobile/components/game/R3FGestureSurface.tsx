import React, { useMemo } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { View, type ViewProps } from "react-native";

export interface R3FGestureSurfaceProps {
  children: React.ReactNode;
  viewProps: ViewProps;
  onPanStart: () => void;
  onPanUpdate: (translationX: number, translationY: number) => void;
  onPanEnd: (velocityX: number, velocityY: number) => void;
  onPinchStart: (focalX: number, focalY: number) => void;
  onPinchUpdate: (scale: number) => void;
  onPinchEnd: () => void;
  onTapStart: (x: number, y: number) => void;
  onSingleTap: (x: number, y: number) => void;
  onDoubleTap: (x: number, y: number) => void;
}

export function R3FGestureSurface({
  children,
  viewProps,
  onPanStart,
  onPanUpdate,
  onPanEnd,
  onPinchStart,
  onPinchUpdate,
  onPinchEnd,
  onTapStart,
  onSingleTap,
  onDoubleTap,
}: R3FGestureSurfaceProps) {
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .minDistance(7)
      .onStart(onPanStart)
      .onUpdate((event) =>
        onPanUpdate(event.translationX, event.translationY),
      )
      .onFinalize((event, success) =>
        onPanEnd(
          success ? event.velocityX : 0,
          success ? event.velocityY : 0,
        ),
      );
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart((event) => onPinchStart(event.focalX, event.focalY))
      .onUpdate((event) => onPinchUpdate(event.scale))
      .onFinalize(onPinchEnd);
    const doubleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .maxDelay(320)
      .maxDistance(24)
      .onBegin((event) => onTapStart(event.x, event.y))
      .onEnd((event) => onDoubleTap(event.x, event.y));
    const singleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(1)
      .maxDeltaX(12)
      .maxDeltaY(12)
      .onEnd((event) => onSingleTap(event.x, event.y));

    return Gesture.Simultaneous(
      pan,
      pinch,
      Gesture.Exclusive(doubleTap, singleTap),
    );
  }, [
    onDoubleTap,
    onPanEnd,
    onPanStart,
    onPanUpdate,
    onPinchEnd,
    onPinchStart,
    onPinchUpdate,
    onSingleTap,
    onTapStart,
  ]);

  return (
    <GestureDetector gesture={gesture}>
      <View {...viewProps}>{children}</View>
    </GestureDetector>
  );
}
