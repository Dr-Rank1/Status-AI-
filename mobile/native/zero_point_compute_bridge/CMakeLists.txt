cmake_minimum_required(VERSION 3.16)
project(status_zpe LANGUAGES CXX)

add_library(status_zpe SHARED src/status_zpe.cpp)
target_include_directories(status_zpe PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_compile_features(status_zpe PUBLIC cxx_std_17)
