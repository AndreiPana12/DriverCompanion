import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

export const useThemedStyles = (baseStyles: any) => {
  const { isDarkMode, colors } = useTheme();

  const getThemedStyle = (baseStyle: any, overrides: any = {}) => {
    return [baseStyle, overrides];
  };

  return {
    isDarkMode,
    colors,
    searchBox: getThemedStyle(baseStyles.searchBox, {
      backgroundColor: colors.surface,
      color: colors.text,
      borderColor: colors.border,
    }),
    predictions: getThemedStyle(baseStyles.predictions, {
      backgroundColor: colors.surface,
    }),
    predictionItem: getThemedStyle(baseStyles.predictionItem, {
      backgroundColor: colors.surface,
      borderBottomColor: colors.border,
    }),
    predictionText: {
      color: colors.text,
      fontSize: 16,
    },
    modalContent: getThemedStyle(baseStyles.modalContent, {
      backgroundColor: colors.surface,
    }),
    modalTitle: getThemedStyle(baseStyles.modalTitle, {
      color: colors.text,
    }),
    markerTypeTitle: getThemedStyle(baseStyles.markerTypeTitle, {
      color: colors.text,
    }),
    closeModalText: getThemedStyle(baseStyles.closeModalText, {
      color: colors.primary,
    }),
    instructionText: getThemedStyle(baseStyles.instructionText, {
      color: colors.text,
    }),
    placementInstructions: getThemedStyle(baseStyles.placementInstructions, {
      backgroundColor: colors.surface,
    }),
  };
};
