cmake_minimum_required(VERSION 3.16)
project(status_meta_compiler LANGUAGES CXX)

add_library(status_meta_compiler SHARED
  src/status_meta_compiler.cpp
)

target_include_directories(status_meta_compiler
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(status_meta_compiler PUBLIC cxx_std_17)
