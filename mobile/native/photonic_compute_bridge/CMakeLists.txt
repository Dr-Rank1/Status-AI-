cmake_minimum_required(VERSION 3.16)
project(status_photonic LANGUAGES CXX)

add_library(status_photonic SHARED
  src/status_photonic.cpp
)

target_include_directories(status_photonic
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(status_photonic PUBLIC cxx_std_17)
target_compile_options(status_photonic PRIVATE -O3 -ffast-math)

install(TARGETS status_photonic DESTINATION lib)
install(FILES include/status_photonic.h DESTINATION include)
