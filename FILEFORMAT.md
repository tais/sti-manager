This is a try at turning the original STI format documentation into something readable and understandable  
Original can be found at http://ja2v113.pbworks.com/w/page/4218367/STCI%20%28STI%29%20format%20description

# STСI (Sir-Tech's Crazy Image) file format.
The STСI format is used to store graphical objects of Jagged Alliance 2.  
Every STCI file can hold one or more images, images are stored using either a 16-bit (16bppRGB565) or 8-bit (8bppIndexed) format.  
A 16-bit file holds just one noncompressed image, most of these are located in the LOADSCREENS folder.

## Header (64 bytes, STCIHeader structure)
STCIHeader structure is described in Standard Gaming Platform\imgfmt.h

### header (24 bytes)
- byte 1-4, character string “STCI”, the format identifier
- byte 5-8, initial size of the image in bytes, For files with multiple images this is a large senseless number
- byte 9-12, image size in bytes after compression
- byte 13-16, number of the transparent color in the palette, always 0. Used only for 8-bit files
- byte 17-20, flags
  - bit 1, always 0, unknown purpose (STCI_TRANSPARENT)
  - bit 2, always 0, unknown purpose (STCI_ALPHA)
  - bit 3, value 1 tells if file is the 16-bit file (STCI_RGB)
  - bit 4, value 1 tells if file is the 8-bit file (STCI_INDEXED)
  - bit 5, value 1 if ZLIB compression algorithm used (STCI_ZLIB_COMPRESSED)
  - bit 6, value 1 if ETRLE compression algorithm used (STCI_ETRLE_COMPRESSED)
  - bits 7-32, value 0, not used

> It seems to be that the flags value always equals to 4, 40 or 41.
> - value 4 for 16-bit files [bit 3 only]
> - value 40 for 8-bit non-animated files (single image) [bit 4 and 6]
> - value 41 for 8-bit animated files (multiple images) [bit 4, 6 and 1]

- byte 21-22, height of the image in pixels, this is used in 16-bit files only
- byte 23-24, width of the image in pixels, this is used in 16-bit files only

### byte 25-44
Values of the next 20 bytes depend on encoding algorithm.  
Colors depth and mask values correspond to 16bppRGB565 encoding algorithm.

- byte 25-44 for 16-bit files:
  - byte 25-28, red color mask, seems to always equal to 63488 (00000000 00000000 11111000 00000000)
  - byte 29-32, green color mask, seems to always equal to 2016 (00000000 00000000 00000111 11100000)
  - byte 33-36, blue color mask, seems to always equal to 31 (00000000 00000000 00000000 00011111)
  - byte 37-40 bytes – alpha-channel mask, seems to always equal to 0
  - byte 41, red color depth, seems to always equal to 5
  - byte 42, green color depth, seems to always equal to 6
  - byte 43, blue color depth, seems to always equal to 5
  - byte 44, alpha-channel depth, seems to always equal to 0

-  byte 25-44 for 8-bit files:
  - byte 25-28, number of colors in a palette, seems to be always 256
  - byte 29-30, number of images in the file
  - byte 31, red color depth, seems to be always 8
  - byte 32, green color depth, seems to be always 8
  - byte 33, blue color depth, seems to be always 8
  - byte 34-44, not used

### byte 45-64
Algorithm used for encoding 8-bit files – 8bppIndexed with 24-bit palette for 256 colors.
- byte 45, color depth, number of bits for one pixel (8 for 8-bit files and 16 for 16-bit files)
- byte 46-49, size of Application Data in bytes, only for animated files this is higher than 0  
  Value for this seems to be the number of images multiplied by 16.
- byte 49-64, not used.

There is a possibility that there are STCI file where byte 46-48 are not used, which could mean the size of the application data bytes shift 3 bytes.  
This could maybe depend on localization. In .NET StiEditor such byte order is used.

## Image data

### 16-bit
In 16-bit files there is image data encoded in 16bppRGB565 format starting after the 64 byte header to the end of file.

### 8-bit
8-bit files have the following structure
- 64 bytes header
- 768 bytes palette (256*3 = 768 bytes of palette)
- image headers of total size (number of images) x 16 bytes
- image data at offset header byte 1-4 with the amount of bytes as found in byte 5-8 of the image headers

### Image header (16 bytes, STCISubImage structure) [8-bit format]
STCISubImage structure is described in Standard Gaming Platform\imgfmt.h

- byte 1-4, shift in bytes from the beginning of the previous image data to beginning of the current image data  
  0 for the first image, size in bytes of the first (previous) image for the second and so on
- byte 5-8, image data size in bytes
- byte 9-10, horizontal image shift in pixels
- byte 11-12, vertical image shift in pixels
- byte 13-14, image height in pixels
- byte 15-16, image width in pixels

### Image data [8-bit format]
After the image headers comes the image data.  
Image data is compressed using ETRLE compression algorithm (see below), it seems that ZLIB compression is not used.  
Non-animated 8-bit files are finished after this.

### Animated files
Animated files have additional Application Data. Size – (number of images) x 16
with the following content:
- images which are the first of a new direction:
  - byte 1-8, value 0, unknown purpose
  - byte 9, equals to number of images in current direction
  - byte 10, value 2, unknown purpose
  - byte 11-16, value 0, unknown purpose
- images which are not the beginning of a new direction:
  - bytes 1-16, value 0, unknown purpose

# ETRLE compression algorithm.
ETRLE abbreviation meaning is unknown. Last three letters most likely mean Run-Length Encoding.  
Compressed sequence consist of multiple subsequences of transparent and non-transparent bytes (SirTech uses zero for transparent color).

## Transparent bytes
Every subsequence on transparent bytes is replaced by one byte with highest bit set to 1 and the lower 7 bits hold number of transparent bytes.
If a sequence of transparent bytes is longer than 127 a new byte for transparent bytes is used and so on.

## Non-transparent bytes
One service byte is used before a subsequence of non-transparent bytes, it's highest bit is set to 0 and the lower 7 bits hold number of non-transparent bytes in subsequence.  
If the amount of non-transparent bytes in the subsequence exceeds 127 a new byte for non-transparent bytes is used and so on.

Every row ends with a full zero byte. 
