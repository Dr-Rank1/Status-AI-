cmake_minimum_required(VERSION 3.16)
project(status_organoid LANGUAGES CXX)

add_library(status_organoid SHARED
  src/status_organoid.cpp
)

target_include_directories(status_organoid
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(status_organoid PUBLIC cxx_std_17)
target_compile_options(status_organoid PRIVATE -O3)

install(TARGETS status_organoid DESTINATION lib)
install(FILES include/status_organoid.h DESTINATION include)
