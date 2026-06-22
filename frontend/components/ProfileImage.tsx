import React from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface ProfileImageProps {
  photoUrl?: string | null;
  size?: number;
  style?: any;
  showBorder?: boolean;
  borderColor?: string;
  fallbackIcon?: string;
  fallbackIconColor?: string;
  fallbackIconSize?: number;
}

const ProfileImage: React.FC<ProfileImageProps> = ({
  photoUrl,
  size = 40,
  style,
  showBorder = false,
  borderColor = '#075B5E',
  fallbackIcon = 'person',
  fallbackIconColor = '#075B5E',
  fallbackIconSize,
}) => {
  const [imageLoading, setImageLoading] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);
  
  const iconSize = fallbackIconSize || Math.max(size * 0.4, 16);
  
  const containerStyle = [
    styles.container,
    {
      width: size,
      height: size,
      borderRadius: size / 2,
    },
    showBorder && {
      borderWidth: 2,
      borderColor: borderColor,
    },
    style,
  ];

  const imageStyle = [
    styles.image,
    {
      width: size,
      height: size,
      borderRadius: size / 2,
    },
  ];

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  // Add timeout to prevent infinite loading
  React.useEffect(() => {
    if (imageLoading) {
      const timeout = setTimeout(() => {
        console.log('ProfileImage: Loading timeout, showing fallback');
        setImageLoading(false);
        setImageError(true);
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [imageLoading]);

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
    console.log('ProfileImage: Failed to load image:', photoUrl);
  };

  const isValidImageUrl = (url: string) => {
    return url && 
           (url.startsWith('http') || url.startsWith('data:image')) && 
           !url.includes('dicebear.com') && // Skip placeholder images
           !imageError;
  };

  // Reset error state when photoUrl changes
  React.useEffect(() => {
    setImageError(false);
    setImageLoading(false);
  }, [photoUrl]);

  if (isValidImageUrl(photoUrl || '')) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri: photoUrl! }}
          style={imageStyle}
          onLoadStart={() => setImageLoading(true)}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
        {imageLoading && (
          <View style={[styles.loadingContainer, { width: size, height: size, borderRadius: size / 2 }]}>
            <ActivityIndicator size="small" color="#075B5E" />
          </View>
        )}
      </View>
    );
  }

  // Fallback to icon
  return (
    <View style={[containerStyle, styles.fallbackContainer]}>
      <Icon 
        name={fallbackIcon} 
        size={iconSize} 
        color={fallbackIconColor} 
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    backgroundColor: '#f0f0f0',
  },
  fallbackContainer: {
    backgroundColor: '#e9ecef',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 1,
  },
});

export default ProfileImage; 