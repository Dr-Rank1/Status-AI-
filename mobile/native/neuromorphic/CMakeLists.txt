cmake_minimum_required(VERSION 3.16)
project(status_neuromorphic LANGUAGES CXX)

add_library(status_neuromorphic SHARED
  src/status_neuromorphic.cpp
)

target_include_directories(status_neuromorphic
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(status_neuromorphic PUBLIC cxx_std_17)
target_compile_options(status_neuromorphic PRIVATE -O3 -ffast-math)

install(TARGETS status_neuromorphic DESTINATION lib)
install(FILES include/status_neuromorphic.h DESTINATION include)
